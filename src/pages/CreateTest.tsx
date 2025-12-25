import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Plus, Trash2, Save, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface Question {
  id?: string;
  question_text: string;
  question_type: 'multiple_choice';
  points: number;
  options: Option[];
}

interface Option {
  id?: string;
  option_text: string;
  is_correct: boolean;
}

const CreateTest: React.FC = () => {
  const navigate = useNavigate();
  const { testId } = useParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [testTitle, setTestTitle] = useState('');
  const [testDescription, setTestDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [accessPassword, setAccessPassword] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question>({
    question_text: '',
    question_type: 'multiple_choice',
    points: 1,
    options: [
      { option_text: '', is_correct: false },
      { option_text: '', is_correct: false },
    ],
  });

  // Check authentication
  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          navigate('/');
          return;
        }

        // Check if user is a teacher
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single();

        if (roleData?.role !== 'teacher') {
          navigate('/');
          return;
        }

        // Get teacher ID
        const { data: teacherData } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (teacherData) {
          setTeacherId(teacherData.id);
          setIsAuthenticated(true);

          // If editing, load test data
          if (testId) {
            loadTest(testId, teacherData.id);
          }
        }
      } catch (error) {
        console.error('Auth error:', error);
        navigate('/');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [navigate, testId]);

  const loadTest = async (tid: string, teacherId: string) => {
    try {
      const { data: testData } = await supabase
        .from('tests')
        .select('*')
        .eq('id', tid)
        .eq('teacher_id', teacherId)
        .single();

      if (testData) {
        setTestTitle(testData.title);
        setTestDescription(testData.description);
        setDurationMinutes(testData.duration_minutes);

        // Load questions
        const { data: questionsData } = await supabase
          .from('questions')
          .select('*')
          .eq('test_id', tid)
          .order('order_index', { ascending: true });

        if (questionsData) {
          // Load options for each question
          const questionsWithOptions = await Promise.all(
            questionsData.map(async (q) => {
              const { data: optionsData } = await supabase
                .from('options')
                .select('*')
                .eq('question_id', q.id);

              return {
                id: q.id,
                question_text: q.question_text,
                question_type: q.question_type,
                points: q.points,
                options: optionsData || [],
              };
            })
          );

          setQuestions(questionsWithOptions);
        }
      }
    } catch (error) {
      toast.error('Failed to load test');
    }
  };

  const handleAddQuestion = () => {
    if (!currentQuestion.question_text.trim()) {
      toast.error('Please enter a question');
      return;
    }

    if (currentQuestion.options.some((o) => !o.option_text.trim())) {
      toast.error('Please fill in all options');
      return;
    }

    if (!currentQuestion.options.some((o) => o.is_correct)) {
      toast.error('Please mark at least one correct answer');
      return;
    }

    setQuestions([...questions, { ...currentQuestion, id: Date.now().toString() }]);
    setCurrentQuestion({
      question_text: '',
      question_type: 'multiple_choice',
      points: 1,
      options: [
        { option_text: '', is_correct: false },
        { option_text: '', is_correct: false },
      ],
    });
    toast.success('Question added');
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleAddOption = () => {
    setCurrentQuestion({
      ...currentQuestion,
      options: [...currentQuestion.options, { option_text: '', is_correct: false }],
    });
  };

  const handleRemoveOption = (index: number) => {
    if (currentQuestion.options.length <= 2) {
      toast.error('At least 2 options are required');
      return;
    }
    setCurrentQuestion({
      ...currentQuestion,
      options: currentQuestion.options.filter((_, i) => i !== index),
    });
  };

  const handleSaveTest = async () => {
    if (!testTitle.trim()) {
      toast.error('Please enter a test title');
      return;
    }

    if (questions.length === 0) {
      toast.error('Please add at least one question');
      return;
    }

    if (!accessPassword.trim()) {
      toast.error('Please set an access password');
      return;
    }

    setIsSaving(true);

    try {
      let finalTestId = testId;

      if (!testId) {
        // Create new test
        const { data: newTest, error: testError } = await supabase
          .from('tests')
          .insert({
            teacher_id: teacherId,
            title: testTitle,
            description: testDescription,
            duration_minutes: durationMinutes,
            access_password_hash: accessPassword, // In production, hash this
            is_active: true,
            is_published: false,
          })
          .select()
          .single();

        if (testError) throw testError;
        finalTestId = newTest.id;
      } else {
        // Update existing test
        const { error: updateError } = await supabase
          .from('tests')
          .update({
            title: testTitle,
            description: testDescription,
            duration_minutes: durationMinutes,
            access_password_hash: accessPassword,
          })
          .eq('id', testId);

        if (updateError) throw updateError;
      }

      // Save questions
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        let questionId = q.id;

        if (!q.id || q.id.toString().startsWith('Date')) {
          // Create new question
          const { data: newQuestion, error: questionError } = await supabase
            .from('questions')
            .insert({
              test_id: finalTestId,
              question_text: q.question_text,
              question_type: q.question_type,
              points: q.points,
              order_index: i,
            })
            .select()
            .single();

          if (questionError) throw questionError;
          questionId = newQuestion.id;
        } else {
          // Update existing question
          await supabase
            .from('questions')
            .update({
              question_text: q.question_text,
              points: q.points,
              order_index: i,
            })
            .eq('id', questionId);
        }

        // Save options
        for (const option of q.options) {
          if (!option.id || option.id.toString().startsWith('Date')) {
            // Create new option
            await supabase.from('options').insert({
              question_id: questionId,
              option_text: option.option_text,
              is_correct: option.is_correct,
            });
          } else {
            // Update existing option
            await supabase
              .from('options')
              .update({
                option_text: option.option_text,
                is_correct: option.is_correct,
              })
              .eq('id', option.id);
          }
        }
      }

      toast.success(testId ? 'Test updated successfully' : 'Test created successfully');
      navigate('/teacher/dashboard');
    } catch (error) {
      toast.error(`Error saving test: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner variant="cyber" text="Loading..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate('/teacher/dashboard')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyber-cyan to-cyber-magenta bg-clip-text text-transparent">
              {testId ? 'Edit Test' : 'Create New Test'}
            </h1>
          </div>
        </div>

        {/* Test Details */}
        <Card className="bg-background/50 border-border/50 mb-6">
          <CardHeader>
            <CardTitle>Test Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Test Title</label>
              <Input
                placeholder="e.g., Mathematics Final Exam"
                value={testTitle}
                onChange={(e) => setTestTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <Textarea
                placeholder="Optional description for the test"
                value={testDescription}
                onChange={(e) => setTestDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Duration (minutes)</label>
                <Input
                  type="number"
                  min="1"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Access Password</label>
                <Input
                  type="password"
                  placeholder="Students will need this to start the test"
                  value={accessPassword}
                  onChange={(e) => setAccessPassword(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Questions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Question List */}
          <div className="lg:col-span-2">
            <Card className="bg-background/50 border-border/50">
              <CardHeader>
                <CardTitle>Questions ({questions.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {questions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No questions added yet</p>
                ) : (
                  <ScrollArea className="h-96">
                    <div className="space-y-3 pr-4">
                      {questions.map((q, idx) => (
                        <Card key={idx} className="bg-background/50 border-border/50">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <p className="font-semibold text-sm mb-2">Q{idx + 1}: {q.question_text}</p>
                                <div className="flex gap-2 flex-wrap">
                                  {q.options.map((opt, optIdx) => (
                                    <Badge
                                      key={optIdx}
                                      variant="outline"
                                      className={opt.is_correct ? 'border-green-500/50 text-green-500' : ''}
                                    >
                                      {opt.option_text}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-500"
                                onClick={() => handleRemoveQuestion(idx)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Add Question Form */}
          <Card className="bg-background/50 border-border/50 lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Add Question</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Question</label>
                <Textarea
                  placeholder="Enter your question"
                  value={currentQuestion.question_text}
                  onChange={(e) =>
                    setCurrentQuestion({ ...currentQuestion, question_text: e.target.value })
                  }
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Points</label>
                <Input
                  type="number"
                  min="1"
                  value={currentQuestion.points}
                  onChange={(e) =>
                    setCurrentQuestion({ ...currentQuestion, points: parseInt(e.target.value) })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Options</label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {currentQuestion.options.map((opt, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input
                        placeholder={`Option ${idx + 1}`}
                        value={opt.option_text}
                        onChange={(e) => {
                          const newOptions = [...currentQuestion.options];
                          newOptions[idx].option_text = e.target.value;
                          setCurrentQuestion({ ...currentQuestion, options: newOptions });
                        }}
                        className="flex-1"
                      />
                      <input
                        type="checkbox"
                        checked={opt.is_correct}
                        onChange={(e) => {
                          const newOptions = [...currentQuestion.options];
                          newOptions[idx].is_correct = e.target.checked;
                          setCurrentQuestion({ ...currentQuestion, options: newOptions });
                        }}
                        className="w-4 h-4"
                        title="Mark as correct answer"
                      />
                      {currentQuestion.options.length > 2 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500"
                          onClick={() => handleRemoveOption(idx)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleAddOption}
                variant="outline"
                className="w-full gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Option
              </Button>

              <Button
                onClick={handleAddQuestion}
                className="w-full bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black font-semibold"
              >
                Add Question
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Save Button */}
        <div className="mt-8 flex gap-4">
          <Button
            onClick={() => navigate('/teacher/dashboard')}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveTest}
            disabled={isSaving}
            className="bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black font-semibold gap-2 flex-1"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Test'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateTest;
