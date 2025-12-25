# Teacher/Student Management System (TSMS) Architecture

## 1. Overview

The TSMS extends the existing CBT system to include a secure, role-based administrative layer for teachers and a managed access system for students.

## 2. Core Requirements

| Feature | Implementation Detail |
| :--- | :--- |
| **Role-Based Access** | Supabase RLS and custom `user_roles` table to distinguish between `teacher` and `student`. |
| **Teacher Dashboard** | A new protected route (`/teacher/dashboard`) for test and student management. |
| **Test Creation** | A form to create tests, add MCQs, set duration, and define a **Test Access Password**. |
| **Student IDs** | Teachers create unique, short Student IDs (e.g., 6-digit number or short string) linked to a specific teacher. |
| **Secure Test Access** | Students must enter the **Test Access Password** and their **Student ID** to start a test. |
| **Results Viewing** | A secure page where students can view their results using their Student ID and a separate **Results Password** (or a unique token). |

## 3. Database Schema Extensions

The existing schema will be modified and extended.

### A. `user_roles` Table (New)

This table links a user's Supabase `auth.uid()` to a specific role.

| Column | Type | Description |
| :--- | :--- | :--- |
| `user_id` | `UUID` | Foreign Key to `auth.users` (Primary Key) |
| `role` | `VARCHAR(20)` | `teacher` or `student` |
| `created_at` | `TIMESTAMP` | Creation timestamp |

### B. `teachers` Table (New)

Stores teacher-specific information.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | Primary Key |
| `user_id` | `UUID` | Foreign Key to `auth.users` |
| `name` | `VARCHAR(255)` | Teacher's full name |
| `created_at` | `TIMESTAMP` | Creation timestamp |

### C. `students` Table (New)

Stores student-specific information, managed by a teacher.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | Primary Key |
| `teacher_id` | `UUID` | Foreign Key to `teachers` table |
| **`student_id_code`** | **`VARCHAR(10)`** | **Unique, short code for student login (e.g., "S1001")** |
| `full_name` | `VARCHAR(255)` | Student's full name |
| `results_password` | `TEXT` | Hashed password for viewing results (or a unique token) |
| `created_at` | `TIMESTAMP` | Creation timestamp |
| `UNIQUE (student_id_code)` | | |

### D. `tests` Table (Modification)

The existing `tests` table will be modified to include security and ownership.

| Column | Type | Description |
| :--- | :--- | :--- |
| `teacher_id` | `UUID` | **New:** Foreign Key to `teachers` table (Owner) |
| **`access_password`** | **`TEXT`** | **New:** Hashed password required to start the test. |
| `is_active` | `BOOLEAN` | **Modified:** Only active tests are visible to students. |

### E. `user_attempts` Table (Modification)

The existing `user_attempts` table will be modified to link to the managed student ID.

| Column | Type | Description |
| :--- | :--- | :--- |
| `user_id` | `UUID` | **Removed/Deprecated:** Will be replaced by `student_id`. |
| **`student_id`** | **`UUID`** | **New:** Foreign Key to `students` table. |
| `UNIQUE (student_id, test_id)` | | |

## 4. Authentication and Authorization Flow

1.  **Sign Up:** New users sign up via the standard Supabase flow.
2.  **Role Assignment:** Upon sign-up, the user is prompted to select their role (`teacher` or `student`).
    *   **Teacher:** An entry is created in the `teachers` table.
    *   **Student:** Students will not have a direct `auth.users` account. They will use their **Student ID** and **Results Password** for all CBT-related access. This simplifies the student experience and keeps the student list managed by the teacher.
3.  **Login:**
    *   **Teacher:** Logs in via standard Supabase email/password.
    *   **Student:** Logs in via a custom form using `student_id_code` and `results_password` to generate a temporary session token for results viewing.
4.  **Authorization:** All routes and database access will be protected by RLS based on the user's role (`teacher` or `anon` for student access).

## 5. Implementation Steps

1.  **Schema Update:** Apply the new schema changes.
2.  **Auth Flow:** Implement the role selection and teacher/student login forms.
3.  **Teacher Dashboard:** Build the main teacher interface.
4.  **Test Management:** Build the forms for creating/editing tests and questions.
5.  **Student Management:** Build the interface for adding students and generating their IDs/passwords.
6.  **Test Access:** Modify the `/test/:testId` route to validate the test password and student ID before starting the test.
7.  **Results View:** Create the secure results page.

This plan ensures a robust, secure, and manageable system that meets all the new requirements.
