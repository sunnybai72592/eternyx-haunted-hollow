-- Enable RLS on CBT tables
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_answers ENABLE ROW LEVEL SECURITY;

-- Tests policies: Anyone can read active tests
CREATE POLICY "Anyone can view active tests"
ON public.tests
FOR SELECT
USING (is_active = true);

-- Admins can manage all tests
CREATE POLICY "Admins can manage tests"
ON public.tests
FOR ALL
USING (public.is_admin());

-- Questions policies: Users can view questions for tests they have an in-progress attempt
CREATE POLICY "Users can view questions for their attempts"
ON public.questions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_attempts ua
    WHERE ua.test_id = questions.test_id
    AND ua.user_id = auth.uid()
    AND ua.status = 'in_progress'
  )
  OR EXISTS (
    SELECT 1 FROM public.tests t
    WHERE t.id = questions.test_id
    AND t.is_active = true
  )
);

-- Admins can manage questions
CREATE POLICY "Admins can manage questions"
ON public.questions
FOR ALL
USING (public.is_admin());

-- Options policies: Users can view options for questions in their attempts
CREATE POLICY "Users can view options for their attempts"
ON public.options
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.questions q
    JOIN public.user_attempts ua ON ua.test_id = q.test_id
    WHERE q.id = options.question_id
    AND ua.user_id = auth.uid()
    AND ua.status = 'in_progress'
  )
  OR EXISTS (
    SELECT 1 FROM public.questions q
    JOIN public.tests t ON t.id = q.test_id
    WHERE q.id = options.question_id
    AND t.is_active = true
  )
);

-- Admins can manage options
CREATE POLICY "Admins can manage options"
ON public.options
FOR ALL
USING (public.is_admin());

-- User Attempts policies
CREATE POLICY "Users can view their own attempts"
ON public.user_attempts
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own attempts"
ON public.user_attempts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own in-progress attempts"
ON public.user_attempts
FOR UPDATE
USING (auth.uid() = user_id AND status = 'in_progress');

-- Admins can manage all attempts
CREATE POLICY "Admins can manage all attempts"
ON public.user_attempts
FOR ALL
USING (public.is_admin());

-- User Answers policies
CREATE POLICY "Users can view their own answers"
ON public.user_answers
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_attempts ua
    WHERE ua.id = user_answers.attempt_id
    AND ua.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert answers for their in-progress attempts"
ON public.user_answers
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_attempts ua
    WHERE ua.id = attempt_id
    AND ua.user_id = auth.uid()
    AND ua.status = 'in_progress'
  )
);

CREATE POLICY "Users can update their answers for in-progress attempts"
ON public.user_answers
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_attempts ua
    WHERE ua.id = user_answers.attempt_id
    AND ua.user_id = auth.uid()
    AND ua.status = 'in_progress'
  )
);

-- Admins can manage all answers
CREATE POLICY "Admins can manage all answers"
ON public.user_answers
FOR ALL
USING (public.is_admin());