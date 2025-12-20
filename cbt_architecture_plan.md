# Computer-Based Test (CBT) System Integration Plan

**Project:** Integration into `sunnybai72592/eternyx-haunted-hollow`
**Technology Stack Identified:**
*   **Frontend:** React (via Vite), TypeScript, Tailwind CSS, Shadcn UI components.
*   **Backend/Database:** Supabase (PostgreSQL) for database, authentication, and likely Edge Functions for serverless logic.

## 1. System Architecture Overview

The CBT system will be implemented as a new module within the existing React application, leveraging Supabase for all backend services.

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Database** | Supabase (PostgreSQL) | Stores test metadata, questions, options, user attempts, and answers. |
| **API/Backend Logic** | Supabase Edge Functions (or existing backend) | Handles secure logic for starting tests, auto-submission, grading, and preventing cheating. |
| **Frontend UI** | React/TypeScript/Shadcn | Renders the "Education" page, test selection, and the secure test-taking interface. |
| **Security/Auth** | Supabase Auth | Manages user login and ensures only authenticated users can access tests and their results. |

## 2. Database Schema Design

The schema is designed to be robust and support the required features (timed, auto-submit, grading). The SQL script is saved as `cbt_schema.sql`.

**Key Tables:**
1.  **`tests`**: Defines the test (title, duration, active status).
2.  **`questions`**: Stores question content, type, and points, linked to a `test_id`.
3.  **`options`**: Stores options for multiple-choice questions, linked to a `question_id`.
4.  **`user_attempts`**: Tracks a user's session (start/end time, status, score), linked to `user_id` and `test_id`.
5.  **`user_answers`**: Stores the user's response for each question in an attempt.

## 3. Implementation of Key Features

| Feature | Implementation Strategy | Frontend/Backend Responsibility |
| :--- | :--- | :--- |
| **"Education" Page** | A new React component (`/src/pages/Education.tsx`) listing available tests from the `tests` table. | Frontend |
| **Timed Answers** | Store `duration_minutes` in the `tests` table. Frontend displays a countdown timer based on `start_time` from `user_attempts`. | Frontend/Backend |
| **Auto-Submit** | **Backend:** A Supabase Edge Function or a PostgreSQL stored procedure (like `check_and_auto_submit_test` in the schema) will periodically check `user_attempts` and submit expired tests. **Frontend:** Submits automatically when the timer hits zero. | Backend (Primary) & Frontend |
| **Screen Lock (Mobile)** | **Frontend:** Use the Capacitor/Cordova API (since `@capacitor/core` is present) to detect when the app is backgrounded or another app is opened. If detected, update the `is_mobile_locked` flag in `user_attempts` and immediately end the test session. | Frontend (Primary) & Backend |
| **Secure Test Interface** | All test data fetching and answer submission will be handled via secure Supabase Row Level Security (RLS) policies, ensuring users can only interact with their own attempts. | Backend (RLS) |

## 4. Next Steps

1.  **Implement Schema:** Apply the `cbt_schema.sql` to the Supabase database.
2.  **API Endpoints:** Create necessary Supabase Edge Functions or backend routes for:
    *   `startTest(testId)`: Creates a new `user_attempts` record.
    *   `submitAnswer(attemptId, questionId, answer)`: Updates `user_answers`.
    *   `submitTest(attemptId)`: Marks attempt as 'submitted' and triggers grading.
3.  **Frontend Development:** Develop the React components for the Education page, the Test interface, and the Results page.
4.  **Integration:** Ensure the new routes and components are properly integrated into the existing application's routing structure.
