-- CBT System Schema for Supabase/PostgreSQL

-- 1. Tests Table: Stores metadata about each test
CREATE TABLE IF NOT EXISTS tests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL, -- Total time allowed for the test
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Questions Table: Stores the questions for all tests
CREATE TABLE IF NOT EXISTS questions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(50) NOT NULL, -- e.g., 'multiple_choice', 'true_false', 'short_answer'
    points INTEGER DEFAULT 1,
    order_index INTEGER NOT NULL, -- For question order within a test
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (test_id, order_index)
);

-- 3. Options Table: Stores the options for multiple-choice questions
CREATE TABLE IF NOT EXISTS options (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. User Attempts Table: Tracks a user's attempt at a test
CREATE TABLE IF NOT EXISTS user_attempts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- Assuming 'users' table exists
    test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE, -- Null until submitted
    status VARCHAR(50) DEFAULT 'in_progress', -- 'in_progress', 'submitted', 'auto_submitted', 'cheated'
    score INTEGER, -- Null until graded
    max_score INTEGER, -- Total possible points for the test
    is_mobile_locked BOOLEAN DEFAULT FALSE, -- Flag for screen lock violation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, test_id) -- Prevents multiple concurrent attempts, can be adjusted
);

-- 5. User Answers Table: Stores the user's response to each question during an attempt
CREATE TABLE IF NOT EXISTS user_answers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    attempt_id UUID REFERENCES user_attempts(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    selected_option_id UUID REFERENCES options(id) ON DELETE SET NULL, -- For multiple choice
    short_answer_text TEXT, -- For short answer questions
    is_correct BOOLEAN, -- Null until graded
    points_awarded INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (attempt_id, question_id)
);

-- Stored Procedure for Auto-Submit and Grading (Simplified)
-- This function will be called by a Supabase Edge Function or a cron job to enforce time limits.
CREATE OR REPLACE FUNCTION check_and_auto_submit_test(p_attempt_id UUID)
RETURNS VOID AS $$
DECLARE
    v_test_duration INTEGER;
    v_start_time TIMESTAMP WITH TIME ZONE;
    v_test_id UUID;
BEGIN
    -- Get test duration and start time
    SELECT
        t.duration_minutes,
        ua.start_time,
        ua.test_id
    INTO
        v_test_duration,
        v_start_time,
        v_test_id
    FROM
        user_attempts ua
    JOIN
        tests t ON ua.test_id = t.id
    WHERE
        ua.id = p_attempt_id
        AND ua.status = 'in_progress';

    -- Check if the time limit has passed
    IF v_start_time IS NOT NULL AND v_test_duration IS NOT NULL AND NOW() > (v_start_time + (v_test_duration * INTERVAL '1 minute')) THEN
        -- Auto-submit the test
        UPDATE user_attempts
        SET
            status = 'auto_submitted',
            end_time = NOW()
        WHERE
            id = p_attempt_id;

        -- TODO: Call a grading function here
        -- SELECT grade_test(p_attempt_id);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- RLS Policies (Example - will need to be fully implemented in Supabase)
-- Policy for 'tests': Anyone can read active tests
-- Policy for 'questions' and 'options': Read-only access for users with an 'in_progress' attempt
-- Policy for 'user_attempts' and 'user_answers': Insert/Update/Read only for the owning user (user_id) and only when status is 'in_progress'
