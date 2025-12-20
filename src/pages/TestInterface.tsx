import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Clock, AlertTriangle, CheckCircle2, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { App as CapacitorApp } from '@capacitor/app';

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  points: number;
  order_index: number;
}

interface Option {
  id: string;
  option_text: string;
  is_correct: boolean;
}

interface TestData {
  id: string;
  title: string;
  duration_minutes: number;
  questions: Question[];
}

interface UserAnswer {
  questionId: string;
  selectedOptionId?: string;
  shortAnswer?: string;
}

const TestInterface: React.FC = () => {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, UserAnswer>>(new Map());
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [screenLockViolation, setScreenLockViolation] = useState(false);
  const [isAppInBackground, setIsAppInBackground] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<any>(null);

  // Fetch test data
  const { data: testData, isLoading: testLoading, error: testError } = useQuery({
    queryKey: ['test', testId],
    queryFn: async () => {
      if (!testId) throw new Error('Test ID is required');

      const { data: test, error: testErr } = await supabase
        .from('tests')
        .select('*')
        .eq('id', testId)
        .single();

      if (testErr) throw testErr;

      const { data: questions, error: questionsErr } = await supabase
        .from('questions')
        .select('*')
        .eq('test_id', testId)
        .order('order_index', { ascending: true });

      if (questionsErr) throw questionsErr;

      return {
        ...test,
        questions: questions || [],
      } as TestData;
    },
  });

  // Fetch question options
  const { data: questionOptions } = useQuery({
    queryKey: ['question-options', testData?.questions[currentQuestionIndex]?.id],
    queryFn: async () => {
      const currentQuestion = testData?.questions[currentQuestionIndex];
      if (!currentQuestion || currentQuestion.question_type !== 'multiple_choice') {
        return [];
      }

      const { data, error } = await supabase
        .from('options')
        .select('*')
        .eq('question_id', currentQuestion.id);

      if (error) throw error;
      return data as Option[];
    },
    enabled: !!testData && currentQuestionIndex < testData.questions.length,
  });

  // Initialize test attempt
  useEffect(() => {
    const initializeAttempt = async () => {
      if (!testId) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be logged in to take a test');
        navigate('/education');
        return;
      }

      // Check if user already has an in-progress attempt
      const { data: existingAttempt } = await supabase
        .from('user_attempts')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('test_id', testId)
        .eq('status', 'in_progress')
        .single();

      if (existingAttempt) {
        setAttemptId(existingAttempt.id);
      } else {
        // Create new attempt
        const { data: newAttempt, error } = await supabase
          .from('user_attempts')
          .insert({
            user_id: user.id,
            test_id: testId,
            status: 'in_progress',
          })
          .select('id')
          .single();

        if (error) {
          toast.error('Failed to start test');
          navigate('/education');
          return;
        }

        setAttemptId(newAttempt.id);
      }
    };

    initializeAttempt();
  }, [testId, navigate]);

  // Initialize timer
  useEffect(() => {
    if (!testData) return;

    const durationSeconds = testData.duration_minutes * 60;
    setTimeRemaining(durationSeconds);

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          // Auto-submit when time runs out
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [testData]);

  // Screen lock detection (Capacitor)
  useEffect(() => {
    const setupScreenLockDetection = async () => {
      try {
        // Listen for app pause (screen lock or background)
        appStateRef.current = await CapacitorApp.addListener('pause', () => {
          setIsAppInBackground(true);
          setScreenLockViolation(true);
          toast.error('Test paused: Screen lock or app backgrounded detected. Your test will be auto-submitted.');
          setTimeout(() => {
            handleAutoSubmit();
          }, 2000);
        });

        // Listen for app resume
        await CapacitorApp.addListener('resume', () => {
          setIsAppInBackground(false);
        });
      } catch (error) {
        // Capacitor not available (web environment)
        console.log('Screen lock detection not available in web environment');
      }
    };

    setupScreenLockDetection();

    return () => {
      appStateRef.current?.remove();
    };
  }, []);

  // Save answer
  const handleAnswerChange = (questionId: string, value: string | undefined) => {
    const newAnswers = new Map(answers);
    const currentQuestion = testData?.questions[currentQuestionIndex];

    if (currentQuestion?.question_type === 'multiple_choice') {
      newAnswers.set(questionId, { questionId, selectedOptionId: value });
    } else if (currentQuestion?.question_type === 'short_answer') {
      newAnswers.set(questionId, { questionId, shortAnswer: value });
    }

    setAnswers(newAnswers);
  };

  // Submit test mutation
  const submitTestMutation = useMutation({
    mutationFn: async () => {
      if (!attemptId || !testData) throw new Error('Missing attempt or test data');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Save all answers to database
      for (const [, answer] of answers) {
        const { error } = await supabase
          .from('user_answers')
          .upsert({
            attempt_id: attemptId,
            question_id: answer.questionId,
            selected_option_id: answer.selectedOptionId || null,
            short_answer_text: answer.shortAnswer || null,
          });

        if (error) throw error;
      }

      // Mark attempt as submitted
      const { error: submitError } = await supabase
        .from('user_attempts')
        .update({
          status: 'submitted',
          end_time: new Date().toISOString(),
        })
        .eq('id', attemptId);

      if (submitError) throw submitError;
    },
    onSuccess: () => {
      toast.success('Test submitted successfully!');
      navigate(`/test-results/${attemptId}`);
    },
    onError: (error) => {
      toast.error('Failed to submit test: ' + (error as Error).message);
    },
  });

  const handleAutoSubmit = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    submitTestMutation.mutate();
  }, [submitTestMutation]);

  const handleManualSubmit = () => {
    setShowExitDialog(false);
    if (timerRef.current) clearInterval(timerRef.current);
    submitTestMutation.mutate();
  };

  const handleExit = () => {
    setShowExitDialog(true);
  };

  if (testLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner variant="cyber" text="Loading test..." />
      </div>
    );
  }

  if (testError || !testData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Alert className="max-w-md border-red-500/50 bg-red-500/5">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-red-500">
            Failed to load test. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const currentQuestion = testData.questions[currentQuestionIndex];
  const progressPercentage = ((currentQuestionIndex + 1) / testData.questions.length) * 100;
  const currentAnswer = answers.get(currentQuestion.id);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isTimeWarning = timeRemaining !== null && timeRemaining < 300; // 5 minutes

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header with Timer */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-cyber-cyan">{testData.title}</h1>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${
              isTimeWarning ? 'border-red-500 bg-red-500/10' : 'border-cyber-cyan/50 bg-cyber-cyan/10'
            }`}>
              <Clock className={`w-5 h-5 ${isTimeWarning ? 'text-red-500 animate-pulse' : 'text-cyber-cyan'}`} />
              <span className={`font-mono font-bold ${isTimeWarning ? 'text-red-500' : 'text-cyber-cyan'}`}>
                {timeRemaining !== null ? formatTime(timeRemaining) : 'Loading...'}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Question {currentQuestionIndex + 1} of {testData.questions.length}</span>
              <span>{Math.round(progressPercentage)}%</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>
        </div>

        {/* Screen Lock Warning */}
        {screenLockViolation && (
          <Alert className="mb-6 border-red-500/50 bg-red-500/5">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-red-500">
              Screen lock or app backgrounding detected. Your test will be auto-submitted to maintain integrity.
            </AlertDescription>
          </Alert>
        )}

        {/* Question Card */}
        <Card className="mb-8 bg-background/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl mb-2">{currentQuestion.question_text}</CardTitle>
            <CardDescription>
              Points: {currentQuestion.points}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {currentQuestion.question_type === 'multiple_choice' && (
              <RadioGroup 
                value={currentAnswer?.selectedOptionId || ''} 
                onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
              >
                <div className="space-y-3">
                  {questionOptions?.map((option) => (
                    <div key={option.id} className="flex items-center space-x-2">
                      <RadioGroupItem value={option.id} id={option.id} />
                      <Label htmlFor={option.id} className="cursor-pointer flex-1">
                        {option.option_text}
                      </Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            )}

            {currentQuestion.question_type === 'short_answer' && (
              <Textarea
                placeholder="Enter your answer here..."
                value={currentAnswer?.shortAnswer || ''}
                onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                className="min-h-32"
              />
            )}

            {currentQuestion.question_type === 'true_false' && (
              <RadioGroup 
                value={currentAnswer?.selectedOptionId || ''} 
                onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
              >
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="true" id="true" />
                    <Label htmlFor="true" className="cursor-pointer">True</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="false" id="false" />
                    <Label htmlFor="false" className="cursor-pointer">False</Label>
                  </div>
                </div>
              </RadioGroup>
            )}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex gap-4 justify-between">
          <Button
            onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
            disabled={currentQuestionIndex === 0}
            variant="outline"
            className="border-cyber-cyan/50 text-cyber-cyan hover:bg-cyber-cyan/10"
          >
            ← Previous
          </Button>

          <div className="flex gap-4">
            <Button
              onClick={handleExit}
              variant="destructive"
              className="gap-2"
            >
              <LogOut className="w-4 h-4" />
              Exit & Submit
            </Button>

            <Button
              onClick={() => setCurrentQuestionIndex(Math.min(testData.questions.length - 1, currentQuestionIndex + 1))}
              disabled={currentQuestionIndex === testData.questions.length - 1}
              className="bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black font-semibold"
            >
              Next →
            </Button>
          </div>
        </div>

        {/* Exit Confirmation Dialog */}
        <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Submit Test?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to submit your test? You won't be able to change your answers after submission.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="my-4 p-3 bg-muted rounded-lg">
              <p className="text-sm font-semibold mb-2">Summary:</p>
              <p className="text-sm text-muted-foreground">
                Answered: {answers.size} / {testData.questions.length} questions
              </p>
            </div>
            <div className="flex gap-4">
              <AlertDialogCancel>Continue Test</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleManualSubmit}
                className="bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black"
              >
                Submit Test
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default TestInterface;
