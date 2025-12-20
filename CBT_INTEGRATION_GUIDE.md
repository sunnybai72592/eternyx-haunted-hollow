# CBT System Integration Guide

## Overview

This document provides a complete guide for integrating the Computer-Based Test (CBT) system into your ETERNYX platform. The CBT system is built with React, TypeScript, and Supabase, and includes secure features like screen lock detection, timed tests, and auto-submission.

## What's Included

### 1. Database Schema (`cbt_schema.sql`)

The schema defines the following tables:

*   **`tests`**: Metadata about each test (title, duration, active status)
*   **`questions`**: Test questions with type and points
*   **`options`**: Multiple-choice options for questions
*   **`user_attempts`**: Tracks user test sessions (start/end time, score, status)
*   **`user_answers`**: Stores user responses to each question

**Key Features:**
*   UUID-based primary keys for security
*   Timestamps for audit trails
*   Status tracking (in_progress, submitted, auto_submitted, cheated)
*   Mobile lock detection flag

### 2. Frontend Components

#### `src/pages/Education.tsx`
The landing page for the CBT system. Features include:
*   Lists all available active tests
*   Shows test duration and description
*   Requires user authentication
*   Responsive design with Shadcn UI components
*   Cyberpunk-themed styling matching your platform

#### `src/pages/TestInterface.tsx`
The main test-taking interface. Features include:
*   **Timer Management**: Countdown timer with visual warnings when time is running low
*   **Screen Lock Detection**: Uses Capacitor API to detect when the app goes to background
*   **Question Navigation**: Previous/Next buttons to move between questions
*   **Answer Persistence**: Saves answers to local state (synced to database on submission)
*   **Auto-Submit**: Automatically submits when time expires
*   **Multiple Question Types**: Multiple choice, true/false, and short answer

#### `src/pages/TestResults.tsx`
Displays test results after submission. Features include:
*   Score display with percentage
*   Pass/fail status
*   Question-by-question breakdown
*   Test metadata (duration, start/end time)
*   Options to retake test or return to education hub

### 3. Backend Functions (Supabase Edge Functions)

#### `supabase/functions/grade-test/index.ts`
Grades a submitted test:
*   Evaluates multiple-choice and true/false answers
*   Calculates total score
*   Marks short answers for manual review
*   Updates the `user_attempts` table with final score

#### `supabase/functions/auto-submit-tests/index.ts`
Runs periodically to auto-submit expired tests:
*   Checks all in-progress attempts
*   Identifies those that have exceeded their time limit
*   Auto-submits them and triggers grading
*   Can be scheduled as a cron job in Supabase

### 4. Architecture Documentation

*   **`cbt_architecture_plan.md`**: High-level system design and integration points
*   **`cbt_schema.sql`**: Complete database schema with comments

## Installation Steps

### Step 1: Apply Database Schema

1.  Open your Supabase dashboard
2.  Navigate to the SQL Editor
3.  Copy the contents of `cbt_schema.sql`
4.  Paste and execute the SQL script
5.  Verify that all tables are created successfully

### Step 2: Deploy Edge Functions

1.  Ensure you have the Supabase CLI installed:
    ```bash
    npm install -g supabase
    ```

2.  Link your project:
    ```bash
    supabase link --project-ref <your-project-ref>
    ```

3.  Deploy the Edge Functions:
    ```bash
    supabase functions deploy grade-test
    supabase functions deploy auto-submit-tests
    ```

4.  Test the functions using the Supabase dashboard or curl:
    ```bash
    curl -X POST https://<your-project>.supabase.co/functions/v1/grade-test \
      -H "Authorization: Bearer <your-anon-key>" \
      -H "Content-Type: application/json" \
      -d '{"attemptId": "<test-attempt-id>"}'
    ```

### Step 3: Verify Routes in App.tsx

The following routes have been added to your application:

*   `/education` - Education hub with available tests
*   `/test/:testId` - Test-taking interface
*   `/test-results/:attemptId` - Test results page

These routes are already configured in `src/App.tsx`.

### Step 4: Set Up Row Level Security (RLS)

To ensure data security, you should implement RLS policies in Supabase:

```sql
-- Example: Allow users to read only their own attempts
CREATE POLICY "Users can read their own attempts"
  ON user_attempts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Example: Allow users to insert their own attempts
CREATE POLICY "Users can create attempts"
  ON user_attempts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Example: Allow users to update only their own in-progress attempts
CREATE POLICY "Users can update their own in-progress attempts"
  ON user_attempts
  FOR UPDATE
  USING (auth.uid() = user_id AND status = 'in_progress')
  WITH CHECK (auth.uid() = user_id);
```

### Step 5: Configure Auto-Submit Cron Job (Optional)

To automatically submit expired tests, you can set up a cron job in Supabase:

1.  Go to your Supabase dashboard
2.  Navigate to Edge Functions
3.  Click on `auto-submit-tests`
4.  Set up a cron trigger (e.g., every 5 minutes: `*/5 * * * *`)

Alternatively, you can call the function manually from your frontend or backend.

## Usage

### For Test Administrators

1.  **Create Tests**: Insert test records into the `tests` table
2.  **Add Questions**: Insert questions into the `questions` table
3.  **Add Options**: For multiple-choice questions, insert options into the `options` table
4.  **Activate Tests**: Set `is_active = true` for tests you want to make available

Example SQL:
```sql
-- Create a test
INSERT INTO tests (title, description, duration_minutes, is_active)
VALUES ('Math Proficiency Test', 'Test your math skills', 30, true);

-- Add a question
INSERT INTO questions (test_id, question_text, question_type, points, order_index)
VALUES ('<test-id>', 'What is 2 + 2?', 'multiple_choice', 1, 1);

-- Add options
INSERT INTO options (question_id, option_text, is_correct)
VALUES ('<question-id>', '3', false),
       ('<question-id>', '4', true),
       ('<question-id>', '5', false);
```

### For Test Takers

1.  Navigate to `/education`
2.  Log in if not already authenticated
3.  Click "Start Test" on any available test
4.  Answer all questions before time runs out
5.  Click "Exit & Submit" to submit your test
6.  View your results on the results page

## Security Features

### 1. Screen Lock Detection
*   Uses Capacitor API to detect when the app goes to background
*   Automatically flags the attempt and submits the test
*   Prevents cheating via alt-tabbing or screen locking

### 2. Timed Tests
*   Frontend countdown timer with visual warnings
*   Backend auto-submit when time expires
*   Prevents users from extending their time

### 3. Authentication
*   All endpoints require Supabase authentication
*   Row Level Security ensures users can only access their own data

### 4. Audit Trail
*   All attempts are logged with timestamps
*   Cheating flags are recorded for review

## Customization

### Styling

All components use Shadcn UI and Tailwind CSS. To customize:

1.  Modify the `className` attributes in the React components
2.  Update the color scheme by editing CSS variables in your global styles
3.  The cyberpunk theme uses `cyber-cyan` and `cyber-magenta` colors

### Question Types

To add new question types:

1.  Update the `question_type` enum in the database
2.  Add a new case in the `TestInterface.tsx` component
3.  Implement grading logic in the `grade-test` Edge Function

### Grading Logic

To customize grading:

1.  Edit the `grade-test` Edge Function
2.  Implement your own scoring algorithm
3.  Handle partial credit or weighted questions as needed

## Troubleshooting

### Tests Not Appearing

*   Ensure `is_active = true` in the `tests` table
*   Verify that questions are properly linked to the test
*   Check that the user is authenticated

### Timer Not Working

*   Ensure the `duration_minutes` field is set in the `tests` table
*   Check browser console for JavaScript errors
*   Verify that the test data is being fetched correctly

### Auto-Submit Not Working

*   Ensure the Edge Function is deployed
*   Check Supabase logs for function errors
*   Verify that the cron job is configured (if using scheduled execution)

### Screen Lock Detection Not Working

*   Screen lock detection only works on mobile apps built with Capacitor
*   On web browsers, the feature may not be available
*   Check that Capacitor plugins are properly initialized

## API Reference

### Grade Test Function

**Endpoint:** `POST /functions/v1/grade-test`

**Request:**
```json
{
  "attemptId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "score": 85,
  "maxScore": 100,
  "percentage": 85.0
}
```

### Auto-Submit Tests Function

**Endpoint:** `POST /functions/v1/auto-submit-tests`

**Request:** (No body required)

**Response:**
```json
{
  "success": true,
  "autoSubmittedCount": 5,
  "attemptIds": ["uuid1", "uuid2", ...]
}
```

## Future Enhancements

*   PDF report generation
*   Analytics dashboard for test administrators
*   Question bank management UI
*   Adaptive testing (difficulty adjustment based on performance)
*   Proctoring features (camera monitoring)
*   Multi-language support
*   Accessibility improvements (WCAG compliance)

## Support

For issues or questions:

1.  Check the troubleshooting section above
2.  Review the Supabase documentation
3.  Check browser console for error messages
4.  Review Supabase logs for backend errors

## License

This CBT system is part of the ETERNYX platform and follows the same license terms.

---

**Last Updated:** December 2025
**Version:** 1.0.0
