import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Plus, Trash2, Copy, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface StudentToAdd {
  id: string;
  full_name: string;
  student_id_code: string;
  results_password: string;
}

const AddStudents: React.FC = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [studentName, setStudentName] = useState('');
  const [studentIdCode, setStudentIdCode] = useState('');
  const [resultsPassword, setResultsPassword] = useState('');
  const [studentsToAdd, setStudentsToAdd] = useState<StudentToAdd[]>([]);
  const [existingStudents, setExistingStudents] = useState<StudentToAdd[]>([]);

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
          loadExistingStudents(teacherData.id);
        }
      } catch (error) {
        console.error('Auth error:', error);
        navigate('/');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [navigate]);

  const loadExistingStudents = async (tid: string) => {
    try {
      const { data } = await supabase
        .from('students')
        .select('*')
        .eq('teacher_id', tid)
        .order('created_at', { ascending: false });

      if (data) {
        setExistingStudents(
          data.map((s) => ({
            id: s.id,
            full_name: s.full_name,
            student_id_code: s.student_id_code,
            results_password: '••••••••', // Don't show actual password
          }))
        );
      }
    } catch (error) {
      toast.error('Failed to load existing students');
    }
  };

  const generateStudentId = () => {
    const code = 'S' + Math.random().toString(36).substring(2, 8).toUpperCase();
    setStudentIdCode(code);
  };

  const generatePassword = () => {
    const password = Math.random().toString(36).substring(2, 10);
    setResultsPassword(password);
  };

  const handleAddStudent = () => {
    if (!studentName.trim()) {
      toast.error('Please enter student name');
      return;
    }

    if (!studentIdCode.trim()) {
      toast.error('Please generate or enter a student ID');
      return;
    }

    if (!resultsPassword.trim()) {
      toast.error('Please generate or enter a password');
      return;
    }

    // Check for duplicate ID
    if (
      studentsToAdd.some((s) => s.student_id_code === studentIdCode) ||
      existingStudents.some((s) => s.student_id_code === studentIdCode)
    ) {
      toast.error('This Student ID already exists');
      return;
    }

    setStudentsToAdd([
      ...studentsToAdd,
      {
        id: Date.now().toString(),
        full_name: studentName,
        student_id_code: studentIdCode,
        results_password: resultsPassword,
      },
    ]);

    // Reset form
    setStudentName('');
    setStudentIdCode('');
    setResultsPassword('');
    toast.success('Student added to list');
  };

  const handleRemoveStudent = (id: string) => {
    setStudentsToAdd(studentsToAdd.filter((s) => s.id !== id));
  };

  const handleSaveStudents = async () => {
    if (studentsToAdd.length === 0) {
      toast.error('Please add at least one student');
      return;
    }

    setIsSaving(true);

    try {
      const studentsData = studentsToAdd.map((s) => ({
        teacher_id: teacherId,
        full_name: s.full_name,
        student_id_code: s.student_id_code,
        results_password_hash: s.results_password, // In production, hash this
        is_active: true,
      }));

      const { error } = await supabase.from('students').insert(studentsData);

      if (error) throw error;

      toast.success(`${studentsToAdd.length} student(s) added successfully`);
      setStudentsToAdd([]);
      loadExistingStudents(teacherId!);
    } catch (error) {
      toast.error(`Error saving students: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
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
              Add Students
            </h1>
            <p className="text-muted-foreground">Create student IDs for your class</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Student Form */}
          <Card className="bg-background/50 border-border/50 lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">New Student</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Full Name</label>
                <Input
                  placeholder="e.g., John Doe"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Student ID</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., S1001"
                    value={studentIdCode}
                    onChange={(e) => setStudentIdCode(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={generateStudentId}
                    className="flex-shrink-0"
                  >
                    Generate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Unique identifier for this student
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Results Password</label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={resultsPassword}
                    onChange={(e) => setResultsPassword(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={generatePassword}
                    className="flex-shrink-0"
                  >
                    Generate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Used to view test results
                </p>
              </div>

              <Button
                onClick={handleAddStudent}
                className="w-full bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black font-semibold gap-2"
              >
                <Plus className="w-4 h-4" />
                Add to List
              </Button>
            </CardContent>
          </Card>

          {/* Students List */}
          <div className="lg:col-span-2 space-y-6">
            {/* Students to Add */}
            {studentsToAdd.length > 0 && (
              <Card className="bg-background/50 border-border/50">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Ready to Add ({studentsToAdd.length})</CardTitle>
                    <CardDescription>Review before saving</CardDescription>
                  </div>
                  <Button
                    onClick={handleSaveStudents}
                    disabled={isSaving}
                    className="bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black font-semibold"
                  >
                    {isSaving ? 'Saving...' : 'Save All'}
                  </Button>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-96">
                    <div className="space-y-3 pr-4">
                      {studentsToAdd.map((student) => (
                        <Card key={student.id} className="bg-background/50 border-border/50">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h3 className="font-semibold mb-2">{student.full_name}</h3>
                                <div className="space-y-1 text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">ID:</span>
                                    <Badge variant="outline" className="font-mono">
                                      {student.student_id_code}
                                    </Badge>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        handleCopyToClipboard(student.student_id_code)
                                      }
                                    >
                                      <Copy className="w-3 h-3" />
                                    </Button>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Password:</span>
                                    <Badge variant="outline" className="font-mono">
                                      {student.results_password}
                                    </Badge>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        handleCopyToClipboard(student.results_password)
                                      }
                                    >
                                      <Copy className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-500"
                                onClick={() => handleRemoveStudent(student.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Existing Students */}
            {existingStudents.length > 0 && (
              <Card className="bg-background/50 border-border/50">
                <CardHeader>
                  <CardTitle>Existing Students ({existingStudents.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-96">
                    <div className="space-y-3 pr-4">
                      {existingStudents.map((student) => (
                        <Card key={student.id} className="bg-background/50 border-border/50">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h3 className="font-semibold mb-2">{student.full_name}</h3>
                                <div className="space-y-1 text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">ID:</span>
                                    <Badge variant="outline" className="font-mono">
                                      {student.student_id_code}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                              <Badge variant="outline" className="border-green-500/50 text-green-500">
                                Active
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {studentsToAdd.length === 0 && existingStudents.length === 0 && (
              <Card className="bg-background/50 border-border/50">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <p>No students yet. Add your first student using the form on the left.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Back Button */}
        <div className="mt-8">
          <Button
            onClick={() => navigate('/teacher/dashboard')}
            variant="outline"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AddStudents;
