-- Teacher/Student Management System (TSMS) Schema for Supabase/PostgreSQL

-- 1. User Roles Table: Maps users to their role (teacher or student)
CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    role VARCHAR(20) NOT NULL CHECK (role IN ('teacher', 'student')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Teachers Table: Stores teacher-specific information
CREATE TABLE IF NOT EXISTS teachers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    institution VARCHAR(255), -- School/University name
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Students Table: Stores student information managed by teachers
CREATE TABLE IF NOT EXISTS students (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE NOT NULL,
    student_id_code VARCHAR(20) UNIQUE NOT NULL, -- Short code for login (e.g., "S1001")
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    results_password_hash TEXT, -- Hashed password for viewing results
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Modify Tests Table: Add teacher ownership and access password
ALTER TABLE tests ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS access_password_hash TEXT; -- Hashed password for test access
ALTER TABLE tests ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE; -- Only published tests are visible to students

-- 5. Modify User Attempts Table: Replace user_id with student_id
-- Note: This requires careful migration of existing data
ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES students(id) ON DELETE CASCADE;
-- The old user_id column can be deprecated but not dropped to avoid breaking existing code

-- 6. Create a function to hash passwords using pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_students_teacher_id ON students(teacher_id);
CREATE INDEX IF NOT EXISTS idx_students_student_id_code ON students(student_id_code);
CREATE INDEX IF NOT EXISTS idx_tests_teacher_id ON tests(teacher_id);
CREATE INDEX IF NOT EXISTS idx_user_attempts_student_id ON user_attempts(student_id);

-- 8. Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Create triggers to automatically update updated_at
CREATE TRIGGER update_teachers_updated_at
BEFORE UPDATE ON teachers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_students_updated_at
BEFORE UPDATE ON students
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tests_updated_at
BEFORE UPDATE ON tests
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 10. RLS Policies

-- Enable RLS on all tables
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- RLS Policy for user_roles: Users can only read their own role
CREATE POLICY "Users can read their own role"
ON user_roles
FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policy for teachers: Teachers can read their own record
CREATE POLICY "Teachers can read their own record"
ON teachers
FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policy for teachers: Teachers can update their own record
CREATE POLICY "Teachers can update their own record"
ON teachers
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS Policy for students: Teachers can read students they created
CREATE POLICY "Teachers can read their students"
ON students
FOR SELECT
USING (
    teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
    )
);

-- RLS Policy for students: Teachers can insert students
CREATE POLICY "Teachers can create students"
ON students
FOR INSERT
WITH CHECK (
    teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
    )
);

-- RLS Policy for students: Teachers can update their students
CREATE POLICY "Teachers can update their students"
ON students
FOR UPDATE
USING (
    teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
    )
)
WITH CHECK (
    teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
    )
);

-- RLS Policy for students: Teachers can delete their students
CREATE POLICY "Teachers can delete their students"
ON students
FOR DELETE
USING (
    teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
    )
);

-- RLS Policy for tests: Teachers can read their own tests
CREATE POLICY "Teachers can read their own tests"
ON tests
FOR SELECT
USING (
    teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
    )
    OR is_published = TRUE -- Published tests are visible to anyone (for student preview)
);

-- RLS Policy for tests: Teachers can create tests
CREATE POLICY "Teachers can create tests"
ON tests
FOR INSERT
WITH CHECK (
    teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
    )
);

-- RLS Policy for tests: Teachers can update their own tests
CREATE POLICY "Teachers can update their own tests"
ON tests
FOR UPDATE
USING (
    teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
    )
)
WITH CHECK (
    teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
    )
);

-- RLS Policy for tests: Teachers can delete their own tests
CREATE POLICY "Teachers can delete their own tests"
ON tests
FOR DELETE
USING (
    teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
    )
);

-- RLS Policy for questions: Teachers can read questions for their tests
CREATE POLICY "Teachers can read questions for their tests"
ON questions
FOR SELECT
USING (
    test_id IN (
        SELECT id FROM tests WHERE teacher_id IN (
            SELECT id FROM teachers WHERE user_id = auth.uid()
        )
    )
);

-- RLS Policy for questions: Teachers can create questions for their tests
CREATE POLICY "Teachers can create questions for their tests"
ON questions
FOR INSERT
WITH CHECK (
    test_id IN (
        SELECT id FROM tests WHERE teacher_id IN (
            SELECT id FROM teachers WHERE user_id = auth.uid()
        )
    )
);

-- RLS Policy for questions: Teachers can update questions for their tests
CREATE POLICY "Teachers can update questions for their tests"
ON questions
FOR UPDATE
USING (
    test_id IN (
        SELECT id FROM tests WHERE teacher_id IN (
            SELECT id FROM teachers WHERE user_id = auth.uid()
        )
    )
)
WITH CHECK (
    test_id IN (
        SELECT id FROM tests WHERE teacher_id IN (
            SELECT id FROM teachers WHERE user_id = auth.uid()
        )
    )
);

-- RLS Policy for questions: Teachers can delete questions for their tests
CREATE POLICY "Teachers can delete questions for their tests"
ON questions
FOR DELETE
USING (
    test_id IN (
        SELECT id FROM tests WHERE teacher_id IN (
            SELECT id FROM teachers WHERE user_id = auth.uid()
        )
    )
);

-- RLS Policy for user_attempts: Students can read their own attempts
CREATE POLICY "Students can read their own attempts"
ON user_attempts
FOR SELECT
USING (
    student_id IN (
        SELECT id FROM students WHERE teacher_id IN (
            SELECT id FROM teachers WHERE user_id = auth.uid()
        )
    )
    OR user_id = auth.uid() -- For backward compatibility
);

-- RLS Policy for user_attempts: Students can create attempts
CREATE POLICY "Students can create attempts"
ON user_attempts
FOR INSERT
WITH CHECK (
    student_id IN (
        SELECT id FROM students WHERE teacher_id IN (
            SELECT id FROM teachers WHERE user_id = auth.uid()
        )
    )
);

-- RLS Policy for user_attempts: Students can update their own attempts
CREATE POLICY "Students can update their own attempts"
ON user_attempts
FOR UPDATE
USING (
    student_id IN (
        SELECT id FROM students WHERE teacher_id IN (
            SELECT id FROM teachers WHERE user_id = auth.uid()
        )
    )
    OR user_id = auth.uid() -- For backward compatibility
)
WITH CHECK (
    student_id IN (
        SELECT id FROM students WHERE teacher_id IN (
            SELECT id FROM teachers WHERE user_id = auth.uid()
        )
    )
    OR user_id = auth.uid() -- For backward compatibility
);
