import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/LoadingSpinner';
import { AlertCircle, Clock, BookOpen, ArrowRight } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Test {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  is_active: boolean;
  created_at: string;
}

const Education: React.FC = () => {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || null);
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    };

    checkAuth();

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserEmail(session.user.email || null);
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Fetch available tests
  const { data: tests, isLoading, error } = useQuery({
    queryKey: ['available-tests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tests')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Test[];
    },
    enabled: isAuthenticated,
  });

  const handleStartTest = (testId: string) => {
    navigate(`/test/${testId}`);
  };

  const handleLoginRedirect = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <BookOpen className="w-8 h-8 text-cyber-cyan" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyber-cyan to-cyber-magenta bg-clip-text text-transparent">
              Education Hub
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Access our comprehensive collection of Computer-Based Tests (CBTs) to assess your knowledge and skills. 
            Each test is designed with security and fairness in mind.
          </p>
        </div>

        {/* Authentication Check */}
        {!isAuthenticated && (
          <Alert className="mb-8 border-cyber-cyan/50 bg-cyber-cyan/5">
            <AlertCircle className="h-4 w-4 text-cyber-cyan" />
            <AlertDescription className="text-cyber-cyan">
              You need to be logged in to access tests. Please log in or create an account to continue.
              <Button 
                variant="link" 
                className="ml-2 text-cyber-cyan hover:text-cyber-magenta"
                onClick={handleLoginRedirect}
              >
                Go to Login
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center items-center min-h-96">
            <LoadingSpinner variant="cyber" text="Loading available tests..." />
          </div>
        )}

        {/* Error State */}
        {error && (
          <Alert className="mb-8 border-red-500/50 bg-red-500/5">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-red-500">
              Failed to load tests. Please try again later.
            </AlertDescription>
          </Alert>
        )}

        {/* Tests Grid */}
        {isAuthenticated && tests && tests.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tests.map((test) => (
              <Card 
                key={test.id} 
                className="group hover:border-cyber-cyan/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyber-cyan/20 bg-background/50 backdrop-blur-sm border-border/50"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <CardTitle className="text-xl group-hover:text-cyber-cyan transition-colors">
                        {test.title}
                      </CardTitle>
                      <CardDescription className="mt-2">
                        {test.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="space-y-4">
                    {/* Test Duration */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4 text-cyber-cyan" />
                      <span>{test.duration_minutes} minutes</span>
                    </div>

                    {/* Status Badge */}
                    <div className="flex gap-2">
                      <Badge 
                        variant="outline" 
                        className="border-cyber-cyan/50 text-cyber-cyan bg-cyber-cyan/10"
                      >
                        {test.is_active ? 'Available' : 'Inactive'}
                      </Badge>
                    </div>

                    {/* Start Test Button */}
                    <Button
                      onClick={() => handleStartTest(test.id)}
                      className="w-full mt-4 bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black font-semibold group/btn"
                    >
                      Start Test
                      <ArrowRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {isAuthenticated && tests && tests.length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-muted-foreground mb-2">
              No Tests Available
            </h3>
            <p className="text-muted-foreground">
              Check back soon for new tests or contact support for more information.
            </p>
          </div>
        )}

        {/* Information Section */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-background/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Secure Testing</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Our tests are protected with advanced security measures including screen lock detection and session monitoring.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-background/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Timed Assessments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Each test has a specific time limit. The system will automatically submit your answers when time expires.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-background/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Instant Results</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Get immediate feedback on your performance with detailed score breakdowns and analysis.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Education;
