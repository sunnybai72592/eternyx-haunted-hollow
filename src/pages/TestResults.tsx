import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { AlertCircle, CheckCircle2, XCircle, ArrowRight, Download } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AttemptData {
  id: string;
  test_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  status: string;
  score: number;
  max_score: number;
  is_mobile_locked: boolean;
}

interface TestData {
  id: string;
  title: string;
  description: string;
}

interface QuestionResult {
  id: string;
  question_text: string;
  points: number;
  is_correct: boolean;
  points_awarded: number;
  user_answer: string;
}

const TestResults: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [testData, setTestData] = useState<TestData | null>(null);

  // Fetch attempt data
  const { data: attemptData, isLoading: attemptLoading, error: attemptError } = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: async () => {
      if (!attemptId) throw new Error('Attempt ID is required');

      const { data, error } = await supabase
        .from('user_attempts')
        .select('*')
        .eq('id', attemptId)
        .single();

      if (error) throw error;
      return data as AttemptData;
    },
  });

  // Fetch test data
  useEffect(() => {
    const fetchTestData = async () => {
      if (!attemptData) return;

      const { data, error } = await supabase
        .from('tests')
        .select('*')
        .eq('id', attemptData.test_id)
        .single();

      if (!error && data) {
        setTestData(data as TestData);
      }
    };

    fetchTestData();
  }, [attemptData]);

  // Fetch question results
  const { data: questionResults, isLoading: resultsLoading } = useQuery({
    queryKey: ['question-results', attemptId],
    queryFn: async () => {
      if (!attemptId) throw new Error('Attempt ID is required');

      const { data, error } = await supabase
        .from('user_answers')
        .select(`
          id,
          question_id,
          is_correct,
          points_awarded,
          selected_option_id,
          short_answer_text,
          questions (
            id,
            question_text,
            points
          )
        `)
        .eq('attempt_id', attemptId);

      if (error) throw error;

      return data?.map((answer: any) => ({
        id: answer.question_id,
        question_text: answer.questions?.question_text || 'Unknown Question',
        points: answer.questions?.points || 0,
        is_correct: answer.is_correct,
        points_awarded: answer.points_awarded || 0,
        user_answer: answer.selected_option_id || answer.short_answer_text || 'No answer',
      })) || [];
    },
    enabled: !!attemptId,
  });

  const handleDownloadReport = () => {
    // TODO: Implement PDF generation
    alert('Download feature coming soon!');
  };

  const handleRetakTest = () => {
    if (attemptData) {
      navigate(`/test/${attemptData.test_id}`);
    }
  };

  const handleBackToEducation = () => {
    navigate('/education');
  };

  if (attemptLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner variant="cyber" text="Loading results..." />
      </div>
    );
  }

  if (attemptError || !attemptData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Alert className="max-w-md border-red-500/50 bg-red-500/5">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-red-500">
            Failed to load test results. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const scorePercentage = attemptData.max_score > 0 
    ? (attemptData.score / attemptData.max_score) * 100 
    : 0;

  const isPassed = scorePercentage >= 60; // Assuming 60% is passing

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const calculateDuration = () => {
    const start = new Date(attemptData.start_time).getTime();
    const end = new Date(attemptData.end_time).getTime();
    const durationMs = end - start;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Results Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            {isPassed ? (
              <CheckCircle2 className="w-20 h-20 text-green-500" />
            ) : (
              <XCircle className="w-20 h-20 text-red-500" />
            )}
          </div>

          <h1 className="text-4xl font-bold mb-2">
            {isPassed ? (
              <span className="text-green-500">Test Passed!</span>
            ) : (
              <span className="text-red-500">Test Not Passed</span>
            )}
          </h1>

          {testData && (
            <p className="text-xl text-muted-foreground mb-4">
              {testData.title}
            </p>
          )}
        </div>

        {/* Score Card */}
        <Card className="mb-8 bg-background/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle>Your Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Large Score Display */}
              <div className="text-center">
                <div className="text-6xl font-bold bg-gradient-to-r from-cyber-cyan to-cyber-magenta bg-clip-text text-transparent mb-2">
                  {attemptData.score}/{attemptData.max_score}
                </div>
                <div className="text-2xl font-semibold text-muted-foreground">
                  {scorePercentage.toFixed(1)}%
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <Progress value={scorePercentage} className="h-3" />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex justify-center">
                <Badge 
                  className={`text-lg px-4 py-2 ${
                    isPassed 
                      ? 'bg-green-500/20 text-green-500 border-green-500/50' 
                      : 'bg-red-500/20 text-red-500 border-red-500/50'
                  }`}
                  variant="outline"
                >
                  {isPassed ? 'PASSED' : 'NOT PASSED'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test Details */}
        <Card className="mb-8 bg-background/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle>Test Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Started</p>
                <p className="font-semibold text-sm">{formatDate(attemptData.start_time)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Completed</p>
                <p className="font-semibold text-sm">{formatDate(attemptData.end_time)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Duration</p>
                <p className="font-semibold text-sm">{calculateDuration()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Status</p>
                <p className="font-semibold text-sm capitalize">{attemptData.status}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Warnings */}
        {attemptData.is_mobile_locked && (
          <Alert className="mb-8 border-yellow-500/50 bg-yellow-500/5">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            <AlertDescription className="text-yellow-500">
              Screen lock or app backgrounding was detected during this test. Your score may be affected.
            </AlertDescription>
          </Alert>
        )}

        {/* Question Breakdown */}
        {!resultsLoading && questionResults && (
          <Card className="mb-8 bg-background/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle>Question Breakdown</CardTitle>
              <CardDescription>
                Review your answers and performance on each question
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {questionResults.map((question, index) => (
                  <div 
                    key={question.id} 
                    className="p-4 border border-border/50 rounded-lg hover:border-cyber-cyan/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-semibold mb-1">
                          Question {index + 1}: {question.question_text}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Your answer: {question.user_answer}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {question.is_correct ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}
                        <span className="font-semibold">
                          {question.points_awarded}/{question.points}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            onClick={handleDownloadReport}
            variant="outline"
            className="border-cyber-cyan/50 text-cyber-cyan hover:bg-cyber-cyan/10 gap-2"
          >
            <Download className="w-4 h-4" />
            Download Report
          </Button>

          <Button
            onClick={handleRetakTest}
            className="bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black font-semibold gap-2"
          >
            Retake Test
            <ArrowRight className="w-4 h-4" />
          </Button>

          <Button
            onClick={handleBackToEducation}
            variant="outline"
            className="border-cyber-cyan/50 text-cyber-cyan hover:bg-cyber-cyan/10"
          >
            Back to Education
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TestResults;
