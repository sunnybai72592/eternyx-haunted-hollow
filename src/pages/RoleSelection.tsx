import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BookOpen, Users, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const RoleSelection: React.FC = () => {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<'teacher' | 'student' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRoleSelection = async (role: 'teacher' | 'student') => {
    setSelectedRole(role);
    setIsLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError('User not found. Please log in again.');
        return;
      }

      // Insert role into user_roles table
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: user.id,
          role: role,
        });

      if (roleError) throw roleError;

      // If teacher, create a teacher record
      if (role === 'teacher') {
        const { error: teacherError } = await supabase
          .from('teachers')
          .insert({
            user_id: user.id,
            name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Teacher',
            email: user.email,
          });

        if (teacherError) throw teacherError;

        toast.success('Welcome, Teacher! Redirecting to your dashboard...');
        navigate('/teacher/dashboard');
      } else {
        // If student, redirect to student login page
        toast.success('Role selected. You will be able to access tests with your Student ID.');
        navigate('/student/login');
      }
    } catch (err) {
      const errorMessage = (err as Error).message || 'An error occurred';
      setError(errorMessage);
      toast.error(`Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/50 flex items-center justify-center py-8 px-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyber-cyan to-cyber-magenta bg-clip-text text-transparent mb-4">
            Welcome to Eternyx Hub
          </h1>
          <p className="text-muted-foreground text-lg">
            Select your role to get started
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Role Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Teacher Card */}
          <Card
            className={`cursor-pointer transition-all border-2 ${
              selectedRole === 'teacher'
                ? 'border-cyber-cyan bg-cyber-cyan/10'
                : 'border-border/50 hover:border-cyber-cyan/50'
            }`}
            onClick={() => !isLoading && handleRoleSelection('teacher')}
          >
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-gradient-to-r from-cyber-cyan to-cyber-magenta rounded-lg">
                  <BookOpen className="w-6 h-6 text-black" />
                </div>
                <CardTitle>Teacher</CardTitle>
              </div>
              <CardDescription>Create and manage tests for your students</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-cyber-cyan mt-1">✓</span>
                  <span>Create and manage multiple tests</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyber-cyan mt-1">✓</span>
                  <span>Add multiple-choice questions (MCQs)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyber-cyan mt-1">✓</span>
                  <span>Manage student IDs and access</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyber-cyan mt-1">✓</span>
                  <span>View student results and analytics</span>
                </li>
              </ul>
              <Button
                onClick={() => handleRoleSelection('teacher')}
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black font-semibold"
              >
                {isLoading && selectedRole === 'teacher' ? 'Setting up...' : 'Continue as Teacher'}
              </Button>
            </CardContent>
          </Card>

          {/* Student Card */}
          <Card
            className={`cursor-pointer transition-all border-2 ${
              selectedRole === 'student'
                ? 'border-cyber-magenta bg-cyber-magenta/10'
                : 'border-border/50 hover:border-cyber-magenta/50'
            }`}
            onClick={() => !isLoading && handleRoleSelection('student')}
          >
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-gradient-to-r from-cyber-magenta to-cyber-cyan rounded-lg">
                  <Users className="w-6 h-6 text-black" />
                </div>
                <CardTitle>Student</CardTitle>
              </div>
              <CardDescription>Take tests and view your results</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-cyber-magenta mt-1">✓</span>
                  <span>Access tests with your Student ID</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyber-magenta mt-1">✓</span>
                  <span>Take secure, timed assessments</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyber-magenta mt-1">✓</span>
                  <span>View your test results</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyber-magenta mt-1">✓</span>
                  <span>Track your progress</span>
                </li>
              </ul>
              <Button
                onClick={() => handleRoleSelection('student')}
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-cyber-magenta to-cyber-cyan hover:from-cyber-magenta/80 hover:to-cyber-cyan/80 text-black font-semibold"
              >
                {isLoading && selectedRole === 'student' ? 'Setting up...' : 'Continue as Student'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Info Section */}
        <Card className="bg-background/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">About Eternyx Hub</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Eternyx Hub is a secure, mobile-friendly Computer-Based Testing (CBT) platform designed for educational institutions. Teachers can create and manage tests with advanced security features, while students can take assessments in a controlled environment.
            </p>
            <p>
              All tests are password-protected and include features like screen lock detection, timed answers, and auto-submit to ensure fairness and integrity.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RoleSelection;
