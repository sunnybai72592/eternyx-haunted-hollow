import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Plus, Edit2, Trash2, Users, BarChart3, LogOut, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface Test {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  is_published: boolean;
  created_at: string;
}

interface Student {
  id: string;
  student_id_code: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

const TeacherDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [tests, setTests] = useState<Test[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalTests: 0,
    totalStudents: 0,
    totalAttempts: 0,
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
        const { data: roleData, error: roleError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single();

        if (roleError || roleData?.role !== 'teacher') {
          navigate('/');
          return;
        }

        // Get teacher ID
        const { data: teacherData, error: teacherError } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (teacherError || !teacherData) {
          navigate('/');
          return;
        }

        setTeacherId(teacherData.id);
        setIsAuthenticated(true);
        loadTests(teacherData.id);
        loadStudents(teacherData.id);
        loadStats(teacherData.id);
      } catch (error) {
        console.error('Auth error:', error);
        navigate('/');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) {
        navigate('/');
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [navigate]);

  const loadTests = async (tid: string) => {
    const { data, error } = await supabase
      .from('tests')
      .select('*')
      .eq('teacher_id', tid)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTests(data);
    }
  };

  const loadStudents = async (tid: string) => {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('teacher_id', tid)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setStudents(data);
    }
  };

  const loadStats = async (tid: string) => {
    // Count tests
    const { count: testCount } = await supabase
      .from('tests')
      .select('id', { count: 'exact' })
      .eq('teacher_id', tid);

    // Count students
    const { count: studentCount } = await supabase
      .from('students')
      .select('id', { count: 'exact' })
      .eq('teacher_id', tid);

    // Count attempts
    const { count: attemptCount } = await supabase
      .from('user_attempts')
      .select('id', { count: 'exact' })
      .in('test_id', tests.map((t) => t.id));

    setStats({
      totalTests: testCount || 0,
      totalStudents: studentCount || 0,
      totalAttempts: attemptCount || 0,
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleDeleteTest = async (testId: string) => {
    if (!confirm('Are you sure you want to delete this test?')) return;

    try {
      await supabase.from('tests').delete().eq('id', testId);
      setTests(tests.filter((t) => t.id !== testId));
      toast.success('Test deleted successfully');
    } catch (error) {
      toast.error('Failed to delete test');
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (!confirm('Are you sure you want to delete this student?')) return;

    try {
      await supabase.from('students').delete().eq('id', studentId);
      setStudents(students.filter((s) => s.id !== studentId));
      toast.success('Student deleted successfully');
    } catch (error) {
      toast.error('Failed to delete student');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner variant="cyber" text="Loading Dashboard..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyber-cyan to-cyber-magenta bg-clip-text text-transparent mb-2">
              Teacher Dashboard
            </h1>
            <p className="text-muted-foreground">Manage your tests and students</p>
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="gap-2 border-red-500/50 text-red-500 hover:bg-red-500/10"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-background/50 border-border/50">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-cyber-cyan mb-2">{stats.totalTests}</div>
                <p className="text-muted-foreground">Total Tests</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-background/50 border-border/50">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-cyber-magenta mb-2">{stats.totalStudents}</div>
                <p className="text-muted-foreground">Total Students</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-background/50 border-border/50">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-cyber-cyan mb-2">{stats.totalAttempts}</div>
                <p className="text-muted-foreground">Test Attempts</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="tests" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="tests">Tests</TabsTrigger>
            <TabsTrigger value="students">Students</TabsTrigger>
          </TabsList>

          {/* Tests Tab */}
          <TabsContent value="tests">
            <Card className="bg-background/50 border-border/50">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Manage Tests</CardTitle>
                  <CardDescription>Create, edit, and manage your tests</CardDescription>
                </div>
                <Button
                  onClick={() => navigate('/teacher/create-test')}
                  className="bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black font-semibold gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Test
                </Button>
              </CardHeader>
              <CardContent>
                {tests.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="mb-4">No tests created yet</p>
                    <Button
                      onClick={() => navigate('/teacher/create-test')}
                      className="bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black font-semibold"
                    >
                      Create Your First Test
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="h-96">
                    <div className="space-y-3">
                      {tests.map((test) => (
                        <Card key={test.id} className="bg-background/50 border-border/50">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h3 className="font-semibold mb-1">{test.title}</h3>
                                <p className="text-sm text-muted-foreground mb-2">{test.description}</p>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {test.duration_minutes} mins
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${
                                      test.is_published
                                        ? 'border-green-500/50 text-green-500'
                                        : 'border-yellow-500/50 text-yellow-500'
                                    }`}
                                  >
                                    {test.is_published ? 'Published' : 'Draft'}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => navigate(`/teacher/edit-test/${test.id}`)}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => navigate(`/teacher/test-results/${test.id}`)}
                                >
                                  <BarChart3 className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-500 hover:text-red-600"
                                  onClick={() => handleDeleteTest(test.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Students Tab */}
          <TabsContent value="students">
            <Card className="bg-background/50 border-border/50">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Manage Students</CardTitle>
                  <CardDescription>Create and manage student IDs</CardDescription>
                </div>
                <Button
                  onClick={() => navigate('/teacher/add-students')}
                  className="bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black font-semibold gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Students
                </Button>
              </CardHeader>
              <CardContent>
                {students.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="mb-4">No students added yet</p>
                    <Button
                      onClick={() => navigate('/teacher/add-students')}
                      className="bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black font-semibold"
                    >
                      Add Your First Student
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="h-96">
                    <div className="space-y-3">
                      {students.map((student) => (
                        <Card key={student.id} className="bg-background/50 border-border/50">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h3 className="font-semibold mb-1">{student.full_name}</h3>
                                <p className="text-sm text-muted-foreground mb-2">
                                  ID: <span className="font-mono text-cyber-cyan">{student.student_id_code}</span>
                                </p>
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${
                                    student.is_active
                                      ? 'border-green-500/50 text-green-500'
                                      : 'border-red-500/50 text-red-500'
                                  }`}
                                >
                                  {student.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-500 hover:text-red-600"
                                onClick={() => handleDeleteStudent(student.id)}
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
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default TeacherDashboard;
