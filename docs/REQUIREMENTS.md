# PawCare — Pet Care Management System
## Requirements & Development Documentation

**Document Version:** 1.2  
**Project Type:** Responsive Web Application  
**Working Name:** PawCare  
**Primary Users:** Pet owners and family members  
**Design Style:** Minimalist  
**Primary Colors:** White and Black  
**Project Status:** Working source and database implemented; production setup pending  

**Updated:** September 11, 2026  
**New requirement:** Multi-factor authentication (MFA)  
**Companion:** [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md)

## Version 1.2 implementation handoff

The user subsequently requested the whole working system and complete database. PawCare now includes the source application, 27 application tables, migration tracking, authenticator-app MFA, and the care modules below. The source passed a production frontend build, 17 database-backed integration scenarios, and 12 unit checks. No hosted deployment or real-device alarm test has been completed. Older roadmap checkboxes below are the original planning checklist; the README and verification document identify the implementation and tested state.

- Preserve the web app, family access, pet photos, and minimalist black-and-white design.
- Add MFA to the MVP: email/password followed by a time-based authenticator code.
- Use mandatory MFA for both household admins and family members as the working design default; this is an implementation assumption, not an additional preference previously confirmed by the user.
- Implement accounts, email verification, MFA, recovery, household membership, the full MVP, and the additional care modules requested in the expanded build.
- Include dedicated feeding plans, grooming records, and expenses in the implemented release. Feeding times and other due dates use the general reminder scheduler.
- Use Sections 5.2, 51, and the companion design to resolve ambiguities in earlier illustrative examples.

---

# 1. Project Overview

**PawCare** is a web-based Pet Care Management System designed for families who want one place to manage the health, care, schedules, medications, appointments, documents, and daily needs of their pets.

The system should allow family members to create profiles for their pets, upload pet photos, record medical information, schedule medication or care reminders, and receive audible alarms when a scheduled activity becomes due.

The application should be responsive and usable on:

- Desktop computers
- Laptops
- Tablets
- Mobile phones

The first version will focus on household pet care rather than veterinary clinic management.

---

# 2. Problem Statement

Pet care information is often scattered across:

- paper vaccination cards;
- veterinary receipts;
- prescriptions;
- chat messages;
- phone reminders;
- handwritten notes;
- photo galleries; and
- separate calendar applications.

Because of this, pet owners may have difficulty remembering medication schedules, vaccination dates, follow-up visits, feeding instructions, grooming schedules, and other recurring pet-care responsibilities.

PawCare aims to centralize these records and reminders in one easy-to-use web application.

---

# 3. Main Objectives

The system should:

1. Provide a centralized profile for every pet.
2. Allow users to upload and update a pet profile picture.
3. Store pet medical and care records.
4. Track medications and medication schedules.
5. Create reminders for medicine, feeding, grooming, vaccinations, appointments, and other activities.
6. Play an audible alarm when a reminder becomes due while the app is open.
7. Show browser notifications when permission is granted.
8. Allow family members to share access to the same pets.
9. Track pet-related expenses.
10. Provide a clean and minimalist black-and-white interface.
11. Work properly on desktop and mobile browsers.
12. Protect household and pet information using authenticated user accounts.

---

# 4. Proposed Users

## 4.1 Household Admin

The Household Admin can:

- Create the household
- Add pets
- Edit pet profiles
- Delete or archive pets
- Upload pet photos
- Add and edit medical records
- Add medications
- Create reminders
- Manage appointments
- Upload documents
- Record expenses
- Invite family members
- Manage family member permissions
- View household activity

## 4.2 Family Member

A Family Member can:

- View pets in the household
- View health records
- View medication schedules
- Create permitted records
- Mark medication as given
- Mark reminders as completed
- Upload permitted files
- Add expenses
- View appointments and schedules

Permissions may be expanded later.

---

# 5. Core System Modules

The first version of PawCare should contain the following modules.

---

## 5.1 Authentication

### Required Features

- User registration
- User login
- Logout
- Forgot password
- Reset password
- Secure password hashing
- Email verification before household access
- Authenticator-app MFA enrollment and verification
- Single-use recovery codes
- Secure authenticator replacement
- Protected pages
- Session handling
- Household membership
- Role-based access

### Acceptance Criteria

- Users must log in before accessing household data.
- Users must only see households they belong to.
- Passwords must never be stored as plain text.
- Unauthorized requests must be rejected by the backend.
- Password verification alone must never grant access to household data.
- MFA enrollment must be confirmed with a valid authenticator code before activation.
- Password reset must preserve the existing MFA requirement.
- Household admins cannot view or reset another member's authentication secrets.

## 5.2 Multi-Factor Authentication

### User experience

At registration, a user verifies their email, signs in with their password, scans a QR code with an authenticator app, and enters a generated six-digit code. On the same phone, a copyable setup key provides an alternative to scanning. The setup page displays recovery codes once and asks the user to confirm saving them.

On subsequent logins:

1. Enter email and password.
2. Enter a current authenticator code, or deliberately choose a saved recovery code.
3. Open the dashboard after the server verifies both factors.

Email verification and password-reset messages are account-management functions. Email or SMS codes are not the planned MFA method for this version.

### PawCare security requirements

| ID | Requirement | Acceptance condition |
|---|---|---|
| MFA-01 | Require two factors for all household users by default. | A correct password alone cannot read any pet, household, file, or care endpoint. |
| MFA-02 | Verify setup before activating a factor. | Starting or cancelling setup cannot mark an account as enrolled. |
| MFA-03 | Limit the lifetime and attempts of partial login. | Password-only challenges expire after 5 minutes and terminate after 5 failed code attempts. |
| MFA-04 | Prevent replay and concurrent reuse. | A successfully accepted TOTP time step or recovery code cannot be accepted again, including by a concurrent request. |
| MFA-05 | Protect stored authentication material. | Passwords and recovery codes are hashed; authenticator secrets are encrypted with a key stored outside the database. |
| MFA-06 | Provide recovery codes. | Generate 10 independent, single-use codes; show/download them only on generation; store no recoverable plaintext copies. |
| MFA-07 | Support safe authenticator replacement. | Require the password and the current factor or an unused recovery code; confirm the new factor before replacing the old one. |
| MFA-08 | Prevent recovery bypass. | Password reset does not disable MFA, grant household access, or automatically sign in. |
| MFA-09 | Revoke access after sensitive changes. | Logout revokes the current session; password reset and factor replacement revoke existing sessions and partial challenges. |
| MFA-10 | Keep records of security events. | Record outcomes and timestamps without passwords, entered codes, QR contents, setup keys, or raw tokens. |

These are PawCare's proposed implementation rules. MFA enrollment, factor changes, recovery, and attempt limiting are informed by the [OWASP MFA guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html). Exact values and data structures are defined in the companion design.

### Lost phone or authenticator

Use the normal password plus an unused recovery code. A recovery-code login permits access and displays a security reminder; replacing the authenticator requires fresh verification. Without either the current factor or recovery codes, self-service recovery is unavailable in the MVP. A household admin cannot bypass this protection. Another existing admin may invite a different verified account to the household, but that does not restore the inaccessible account or alter its history.

### MVP exclusions

- No shared family password or shared authenticator secret.
- No hardcoded production OTP or development bypass in deployed code.
- No trusted-device option that skips MFA.
- No standalone option to turn mandatory MFA off; users can replace the authenticator securely.
- Passkeys and additional factor methods may be evaluated in a later release.

---

# 6. Dashboard

The dashboard should summarize important information.

### Dashboard Sections

- Today's Medications
- Upcoming Reminders
- Overdue Reminders
- Upcoming Vet Appointments
- Vaccinations Due Soon
- Latest Weight
- Recent Health Records
- Monthly Expenses
- Quick Actions

### Quick Actions

- Add Medication
- Add Reminder
- Add Vet Visit
- Log Weight
- Upload Document
- Add Expense

### Example

```text
PAWCARE

Good morning.

Cha Cha

Today's Care
--------------------------------
8:00 AM   Antibiotic       Due
1:00 PM   Feeding          Done
6:00 PM   Wound Cleaning   Upcoming

Upcoming
--------------------------------
Sep 15    Vet Follow-up
Sep 28    Vaccination

[ + Add Reminder ]
```

---

# 7. Pet Profiles

Each pet should have an individual profile.

## Required Information

- Pet ID
- Name
- Profile picture
- Species
- Breed
- Sex
- Date of birth
- Estimated age, if exact birth date is unknown
- Color / markings
- Current weight
- Spayed / neutered status
- Microchip number, optional
- Notes
- Date created
- Last updated

---

# 8. Pet Photo Upload

Users must be able to upload a photo of their dog or other pet.

## Required Functions

- Upload image
- Preview image before saving
- Replace image
- Remove image
- Display profile image
- Use placeholder image when no picture exists

## Accepted Formats

- JPG
- JPEG
- PNG
- WEBP

## Recommended Limit

**Maximum file size:** 5 MB

## Storage Requirement

Do **not** store the entire image directly inside the SQL database.

Recommended approach:

```text
User uploads image
        ↓
Backend validates image
        ↓
Image stored in file/object storage
        ↓
Storage URL saved in database
        ↓
Pet profile displays the image
```

Possible storage choices later:

- Cloudinary
- Supabase Storage
- AWS S3
- Local uploads folder during development

---

# 9. Health Records

Users should be able to maintain the pet's health history.

## Health Record Types

- General Checkup
- Illness
- Diagnosis
- Injury
- Surgery
- Laboratory Result
- Follow-up Visit
- Dental
- Skin Condition
- Other

## Suggested Fields

- Record ID
- Pet ID
- Record type
- Title
- Description
- Symptoms
- Diagnosis
- Procedure
- Veterinarian
- Clinic
- Visit date
- Follow-up date
- Notes
- Attachments
- Created by
- Created date

---

# 10. Vaccination Records

## Required Fields

- Pet
- Vaccine name
- Dose
- Date administered
- Next due date
- Veterinarian
- Clinic
- Batch / lot number, optional
- Notes
- Attachment

## Automation

When a **Next Due Date** is entered, the system should allow the user to automatically create a reminder.

Example:

```text
Rabies Vaccine
Administered: September 28, 2026
Next Due: September 28, 2027

Create Reminder? [Yes]
```

---

# 11. Medication Tracker

This is one of PawCare's primary features.

## Medication Information

- Medication ID
- Pet ID
- Medicine name
- Purpose
- Dosage
- Unit
- Route
- Instructions
- Start date
- End date
- Frequency
- Reminder time
- With food / without food
- Prescribing veterinarian
- Notes
- Status

## Example

```text
Medicine: Antibiotic
Pet: Cha Cha
Dosage: 2 mL
Frequency: Twice daily
Times:
- 8:00 AM
- 8:00 PM
Start Date: September 11
End Date: September 18
```

---

# 12. Alarm & Reminder System

The system must allow users to create alarms for:

- Medication
- Feeding
- Water
- Wound cleaning
- Vaccination
- Deworming
- Flea / tick prevention
- Grooming
- Vet appointment
- Exercise / walking
- Supplements
- Custom reminders

---

## 12.1 Reminder Fields

Each reminder should contain:

- Reminder ID
- Pet ID
- Reminder title
- Reminder type
- Description
- Date
- Time
- Repeat setting
- Sound enabled
- Notification enabled
- Status
- Created by

---

## 12.2 Repeat Options

Support:

- Once
- Daily
- Every X hours
- Weekly
- Selected days of the week
- Monthly
- Custom interval

Example:

```text
Give Antibiotic

Pet: Cha Cha
Time: 8:00 AM
Repeat: Daily
Until: September 18

Sound Alarm: ON
Browser Notification: ON
```

---

# 13. Audible Alarm Behavior

When a reminder reaches its scheduled time:

```text
Current Time
     ↓
Reminder becomes due
     ↓
Show reminder popup
     ↓
Play alarm sound
     ↓
Send browser notification if permitted
     ↓
User selects an action
```

### Reminder Popup

```text
--------------------------------
          MEDICATION TIME

Cha Cha

Antibiotic
2 mL

Scheduled: 8:00 AM

[ MARK AS GIVEN ]
[ SNOOZE ]
[ DISMISS ]
--------------------------------
```

## Required User Actions

### Mark as Given

Records:

- Completion date
- Completion time
- User who completed it

### Snooze

Suggested options:

- 5 minutes
- 10 minutes
- 15 minutes
- 30 minutes
- Custom

### Dismiss

Dismisses the current alert but records that it was dismissed.

---

# 14. Important Web Alarm Limitation

Because PawCare is a **web application**, browsers place restrictions on automatic sound and background activity.

For the first version:

- The alarm should reliably play while the PawCare page/PWA is open and active.
- The user must interact with the application at least once before browsers allow audio playback.
- Browser notifications should be requested with the user's permission.

For stronger reminders even when the website is closed, PawCare can later be implemented as a **Progressive Web App (PWA)** with:

- Service Worker
- Push Notifications
- Push subscription storage
- Backend notification scheduler

However, browser and operating-system restrictions may still differ between devices.

Therefore the requirement should be:

> PawCare must provide audible in-app alarms while the application is active and should provide browser/push notifications on supported devices when permission has been granted.

Do not promise that a normal browser tab can always play sound when completely closed.

---

# 15. Medication History

Every scheduled medication should have a history.

Example:

| Date | Scheduled | Actual | Status | Completed By |
|---|---|---|---|---|
| Sep 11 | 8:00 AM | 8:02 AM | Given | Sarah |
| Sep 11 | 8:00 PM | 8:14 PM | Given | Family Member |
| Sep 12 | 8:00 AM | — | Missed | — |

Possible statuses:

- Upcoming
- Due
- Given
- Late
- Missed
- Skipped
- Dismissed

---

# 16. Vet Visits & Appointments

The system should store:

- Appointment date
- Appointment time
- Pet
- Clinic
- Veterinarian
- Reason for visit
- Notes
- Status
- Reminder schedule

Statuses:

- Upcoming
- Completed
- Cancelled
- Rescheduled

After completing a visit, the user should be able to create a corresponding health record.

---

# 17. Weight Tracker

Users should be able to log:

- Pet
- Weight
- Unit
- Date
- Notes

The system may display a simple line chart showing weight changes over time.

---

# 18. Feeding Tracker

The implemented release includes feeding plans. Use Set reminder to schedule feeding alarms.

## Fields

- Pet
- Food name
- Food type
- Portion
- Unit
- Feeding time
- Frequency
- Dietary instructions
- Notes
- Start and end dates

Feeding schedules should optionally create reminders.

---

# 19. Grooming Tracker

The implemented release includes grooming records and a Set reminder action.

Possible activities:

- Bath
- Haircut
- Nail trimming
- Ear cleaning
- Teeth cleaning
- Grooming appointment
- Custom

Fields:

- Activity
- Pet
- Date
- Next due date
- Groomer
- Cost
- Notes

---

# 20. Expenses

This module is included in the implemented release.

Users should be able to track pet expenses.

## Categories

- Veterinary
- Medication
- Food
- Grooming
- Vaccination
- Supplies
- Surgery
- Laboratory
- Transportation
- Other

## Fields

- Expense ID
- Pet
- Category
- Description
- Amount
- Date
- Receipt
- Paid by
- Notes

Dashboard reports may display:

- Expenses this month
- Expenses per pet
- Expenses by category

---

# 21. Document Management

Users should be able to upload pet documents such as:

- Vaccination cards
- Prescriptions
- Laboratory results
- Veterinary reports
- Surgery documents
- Medical certificates
- Receipts
- Pet identification documents

Recommended formats:

- PDF
- JPG
- JPEG
- PNG

Each document should contain:

- Pet
- Document name
- Document type
- File URL
- Date
- Notes
- Uploaded by

---

# 22. Family Access

A household can contain multiple users.

Example:

```text
HULAR FAMILY
│
├── Sarah
├── Mom
├── Dad
└── Other Family Member

Pets
│
└── Cha Cha
```

All authorized household members may access shared pet information based on their permissions.

---

# 23. Activity Log

Important actions should be recorded.

Example:

```text
Sarah added a medication for Cha Cha.
Mom marked Antibiotic as given.
Sarah uploaded a laboratory result.
Dad added a pet expense.
```

Suggested fields:

- User
- Action
- Entity
- Entity ID
- Date
- Time

---

# 24. Search & Filtering

Users should be able to search and filter records by:

- Pet
- Record type
- Date
- Medication
- Status
- Expense category
- Appointment status

---

# 25. UI / UX Design Requirements

## Design Style

**Minimalist**

The interface should feel:

- Clean
- Calm
- Modern
- Spacious
- Easy to scan
- Not overly decorative

## Primary Colors

```css
--background: #FFFFFF;
--foreground: #000000;
--muted: #F5F5F5;
--border: #E5E5E5;
--secondary-text: #666666;
```

Black should be used primarily for:

- Main text
- Important buttons
- Active navigation
- Icons

White should be used for:

- Main background
- Cards
- Forms
- Modal backgrounds

Gray may be used only for hierarchy, disabled states, separators, and secondary information.

---

# 26. Typography

Recommended fonts:

- Inter
- Geist
- SF Pro style system fonts
- Manrope

Suggested hierarchy:

```text
Page Title        28–32 px
Section Heading   20–24 px
Card Heading      16–18 px
Body              14–16 px
Small Label       12–13 px
```

Avoid excessive bold text.

---

# 27. Buttons

Primary:

```text
Black background
White text
```

Secondary:

```text
White background
Black text
Black/gray border
```

Danger actions may use a subtle red accent only when necessary for actions such as Delete.

---

# 28. Cards

Recommended style:

```text
White background
1px light gray border
Minimal or no shadow
12–16px border radius
Generous padding
```

Avoid heavy gradients and glassmorphism.

---

# 29. Proposed Navigation

Desktop:

```text
PAWCARE

Dashboard
Pets
Medications
Reminders
Health Records
Appointments
Vaccinations
Feeding
Grooming
Documents
Expenses
Family

Settings
Logout
```

Mobile:

Use a collapsible menu or bottom navigation for the most important modules.

---

# 30. Suggested Pet Profile Layout

```text
------------------------------------------------
[ PHOTO ]   CHA CHA

            Shih Tzu
            Female
            3 years old

------------------------------------------------

Overview
Health
Medication
Vaccines
Appointments
Weight
Documents
Expenses

------------------------------------------------

Today's Care

8:00 AM    Antibiotic          GIVEN
1:00 PM    Feeding             UPCOMING
6:00 PM    Wound Cleaning      UPCOMING
------------------------------------------------
```

---

# 31. Responsive Design Requirements

Support at minimum:

### Mobile

320px and above

### Tablet

768px and above

### Desktop

1024px and above

The interface must not require horizontal scrolling during normal use.

---

# 32. Proposed Technical Stack

The following stack is the working design baseline, retained from the original proposal. Exact supported dependency versions will be checked and pinned during setup. No hosting provider has been selected or configured.

## Frontend

- React
- Vite
- Tailwind CSS
- React Router

## Backend

- Node.js
- Express.js

## Database

- MySQL

## Authentication

Working choice:

- Server-side sessions backed by MySQL with opaque secure, HTTP-only cookies
- Argon2id password hashing through a maintained library
- Password plus RFC 6238 TOTP through a maintained library
- QR enrollment and hashed recovery codes
- CSRF protection and server-enforced session, MFA, and role checks

Use a local mail sink for development email verification and password reset. Production requires a configured transactional email provider; it is not supplied by this documentation.

## File Storage

During development:

- Local uploads folder

Production later:

- Cloudinary
- Supabase Storage
- AWS S3

## Notifications

- Web Notifications API
- Service Worker
- Web Push API for supported PWA notifications

## Charts

- Recharts or Chart.js

---

# 33. Proposed System Architecture

```text
          USER
           │
           ▼
     Web Browser / PWA
           │
           ▼
       React Frontend
           │
        REST API
           │
           ▼
     Node / Express API
      │             │
      ▼             ▼
    MySQL      File Storage
                     │
                     ▼
              Pet Photos /
               Documents

Reminder Scheduler
       │
       ├── In-App Alarm
       └── Push Notification
```

---

# 34. Initial Database Entities

The ERD should later include at least:

```text
User
Household
HouseholdMember
Pet
PetPhoto
HealthRecord
Medication
MedicationSchedule
MedicationLog
Reminder
Vaccination
Appointment
WeightLog
FeedingSchedule
GroomingRecord
Expense
Document
ActivityLog
PushSubscription
```

---

# 35. Preliminary Relationships

```text
User
  │
  └── HouseholdMember
          │
          ▼
       Household
          │
          ├── Pet
          │    ├── HealthRecord
          │    ├── Medication
          │    │      ├── MedicationSchedule
          │    │      └── MedicationLog
          │    ├── Reminder
          │    ├── Vaccination
          │    ├── Appointment
          │    ├── WeightLog
          │    ├── FeedingSchedule
          │    ├── GroomingRecord
          │    ├── Expense
          │    └── Document
          │
          └── ActivityLog
```

A full ERD should be designed before database implementation.

---

# 36. Non-Functional Requirements

## Performance

- Normal page loads should feel responsive.
- Common API actions should ideally complete within 1–2 seconds under normal household usage.
- Images should be optimized before display.

## Security

- Password hashing
- Input validation
- Authentication with MFA
- Authorization
- Secure cookies
- Upload validation
- File size limits
- SQL injection protection
- Rate limiting for authentication endpoints

## Usability

- Important actions should require minimal steps.
- Form labels must be clear.
- Error messages must explain how to correct the problem.
- Reminder controls must be large enough for mobile use.

## Reliability

- Records should not disappear after refresh.
- Reminder completion should be persisted.
- Duplicate medication logs should be prevented where appropriate.

## Accessibility

- Sufficient text contrast
- Keyboard-accessible forms
- Descriptive button labels
- Form labels associated with inputs
- Avoid relying only on color for statuses

## Maintainability

- Separate frontend and backend concerns.
- Use reusable components.
- Use consistent API response structures.
- Maintain database migrations.

---

# 37. Business Rules

1. Every pet belongs to a household.
2. Only authorized household members can view the household's pets.
3. Every medication belongs to a pet.
4. Medication schedules cannot exist without a medication.
5. Medication completion must create a medication log.
6. Completed medication logs should record who marked them complete.
7. A reminder must have a valid future or recurring schedule.
8. A user cannot upload unsupported file types.
9. Deleted medical information should preferably be archived rather than permanently removed where history is important.
10. Pet records should remain associated with the correct pet at all times.
11. Expense values cannot be negative.
12. Reminder dates and medication schedules must respect the household/user timezone.

---

# 38. Timezone Requirement

All alarm and reminder scheduling must properly handle timezone information.

For Philippine household use, the default may be:

```text
Asia/Manila
UTC+08:00
```

The system should store timestamps consistently and convert them to the user's timezone when displayed.

---

# 39. Development Roadmap

Do **not** immediately begin coding all features.

Use the following order.

---

## Phase 1 — Requirements

- [x] Choose system concept
- [x] Define system purpose
- [x] Identify primary users
- [x] Define initial modules
- [x] Define photo upload requirement
- [x] Define alarm/reminder requirement
- [x] Define minimalist design direction
- [x] Review requirements for consistency
- [x] Define a working MVP scope
- [x] Separate MVP from future features
- [x] Define detailed acceptance criteria in the companion design

---

## Phase 2 — System Analysis

Create:

- [ ] User stories
- [ ] Use cases
- [ ] Business rules
- [ ] Process flows
- [ ] Data flow
- [ ] Permissions matrix
- [ ] Reminder workflow
- [ ] Medication workflow
- [ ] File upload workflow

---

## Phase 3 — System Design

Create:

- [ ] Sitemap
- [ ] User flow
- [ ] Use Case Diagram
- [ ] System Architecture Diagram
- [ ] ERD
- [ ] Database schema
- [ ] API design
- [ ] Wireframes
- [ ] High-fidelity UI design
- [ ] Responsive design rules

---

## Phase 4 — Project Setup

- [ ] Create Git repository
- [ ] Create frontend project
- [ ] Create backend project
- [ ] Configure environment variables
- [ ] Configure database
- [ ] Add `.gitignore`
- [ ] Create README
- [ ] Establish branch strategy
- [ ] Create development database
- [ ] Create initial migration

Suggested project structure:

```text
pawcare/
│
├── client/
│   └── React frontend
│
├── server/
│   └── Node/Express backend
│
├── docs/
│   ├── REQUIREMENTS.md
│   ├── ERD.md
│   └── API.md
│
├── .gitignore
└── README.md
```

---

# 40. Recommended Build Order

## Sprint 1 — Foundation

This is the first coding milestone after this design handoff. It is not the complete usable MVP.

- [ ] Project setup
- [ ] Database connection
- [ ] Registration, email verification, login, and password reset
- [ ] Authenticator-app MFA and recovery codes
- [ ] Session, CSRF, and authorization controls
- [ ] Household creation
- [ ] Family membership
- [ ] Base navigation
- [ ] Responsive layout

## Sprint 2 — Pet Profiles

- [ ] Pet CRUD
- [ ] Pet profile UI
- [ ] Photo upload
- [ ] Image preview
- [ ] File validation

## Sprint 3 — Health Records

- [ ] Health record CRUD
- [ ] Vaccination records
- [ ] Weight tracking
- [ ] Documents

## Sprint 4 — Medication

- [ ] Medication CRUD
- [ ] Medication schedules
- [ ] Medication logging
- [ ] Today's medication view

## Sprint 5 — Reminders & Alarm

- [ ] Reminder CRUD
- [ ] Reminder scheduler
- [ ] In-app alarm
- [ ] Alarm popup
- [ ] Snooze
- [ ] Mark as completed
- [ ] Browser notification permission
- [ ] Notification testing

## Sprint 6 — Other Care Features

- [ ] Appointments
- [ ] Feeding schedules
- [ ] Grooming
- [ ] Expenses

## Sprint 7 — Dashboard

- [ ] Today's care
- [ ] Upcoming reminders
- [ ] Health overview
- [ ] Expense summary
- [ ] Quick actions

## Sprint 8 — QA

- [ ] Functional testing
- [ ] Responsive testing
- [ ] Browser testing
- [ ] Validation testing
- [ ] Security testing
- [ ] Reminder timing tests
- [ ] Alarm tests
- [ ] Upload tests
- [ ] Permission tests

---

# 41. Alarm Development Plan

The reminder feature should be built in stages.

## Stage 1 — In-App Alarm

When PawCare is open:

```text
Frontend receives scheduled reminders
        ↓
Current time is checked
        ↓
Reminder becomes due
        ↓
Alarm modal opens
        ↓
Audio plays
```

Use the HTML Audio API for the alarm sound.

The application should include an initial user interaction such as:

```text
Enable Reminder Sounds
[ ENABLE ]
```

This helps satisfy browser audio autoplay policies.

---

## Stage 2 — Browser Notifications

Request permission:

```text
PawCare would like to send reminder notifications.

[ Allow ]
```

If granted, show system/browser notifications for due reminders.

---

## Stage 3 — PWA / Push Notifications

For more reliable background reminders:

```text
Frontend
   │
   └── Service Worker
           │
           ▼
    Push Notification
           ▲
           │
Backend Scheduler
```

The backend should know which reminders are due and send notifications to registered push subscriptions.

---

# 42. Alarm Testing Cases

Test at minimum:

- [ ] Reminder exactly at current time
- [ ] Multiple reminders at the same time
- [ ] Snooze for 5 minutes
- [ ] Snooze repeatedly
- [ ] Mark medication as given
- [ ] Dismiss reminder
- [ ] Refresh application before alarm
- [ ] Login shortly before reminder
- [ ] Browser tab active
- [ ] Browser tab in background
- [ ] Browser notifications denied
- [ ] Browser notifications allowed
- [ ] User logged out
- [ ] Different timezone
- [ ] Daily recurring reminder
- [ ] Reminder end date reached
- [ ] Duplicate alarm prevention

---

# 43. Photo Upload Testing Cases

- [ ] Upload JPG
- [ ] Upload PNG
- [ ] Upload WEBP
- [ ] Reject unsupported format
- [ ] Reject oversized image
- [ ] Preview image
- [ ] Replace image
- [ ] Remove image
- [ ] Refresh profile
- [ ] Test mobile upload
- [ ] Test portrait photo
- [ ] Test landscape photo
- [ ] Unauthorized user cannot retrieve private image

---

# 44. Core User Stories

### US-001 — Add Pet

> As a pet owner, I want to create a pet profile so that I can maintain all information related to my pet.

### US-002 — Upload Pet Picture

> As a pet owner, I want to upload a picture of my pet so that I can easily identify the pet profile.

### US-003 — Add Medication

> As a pet owner, I want to record my pet's medicine, dosage, and schedule so that I can properly follow treatment instructions.

### US-004 — Receive Medication Alarm

> As a pet owner, I want PawCare to alert me when my pet's medication is due so that I do not forget to administer it.

### US-005 — Record Medication Completion

> As a family member, I want to mark a medicine as given so that everyone knows the pet already received the scheduled dose.

### US-006 — Snooze Reminder

> As a family member, I want to temporarily snooze an alarm when I cannot immediately perform the care activity.

### US-007 — View Medication History

> As a pet owner, I want to see previous scheduled and completed doses so that I can review medication adherence.

### US-008 — Add Health Record

> As a pet owner, I want to save medical information so that the pet's health history is available when needed.

### US-009 — Share With Family

> As a household admin, I want family members to access the same pet information so that everyone can coordinate pet care.

---

# 45. MVP Definition

For the project to qualify as the **first usable version**, it must have:

- [ ] Account registration, email verification, login, and password reset
- [ ] Authenticator-app MFA
- [ ] Recovery codes and secure factor replacement
- [ ] Household
- [ ] Family membership
- [ ] Pet profile
- [ ] Pet photo upload
- [ ] Health records
- [ ] Vaccination records
- [ ] Medication records
- [ ] Medication schedules
- [ ] Audible in-app alarm
- [ ] Snooze
- [ ] Mark as given
- [ ] Medication history
- [ ] General reminders
- [ ] Appointments
- [ ] Weight tracker
- [ ] Documents
- [ ] Responsive dashboard
- [ ] Minimalist black-and-white interface

Features outside this list should not delay the MVP.

---

# 46. Future Features

Possible future enhancements:

- Push notifications when PawCare is closed
- Email reminders
- SMS reminders
- Multiple households
- Veterinary clinic portal
- Vet account
- QR pet profile
- Emergency medical card
- Prescription scanning
- Pet growth analytics
- Printable medical summary
- PDF report generation
- Calendar integration
- Medication inventory
- Food inventory
- AI-assisted record summarization

AI should **not** diagnose a pet or replace veterinary care.

---

# 47. What We Need Before Coding

Before starting development, finalize the following:

### Product

- [ ] Final application name
- [ ] MVP feature list
- [ ] User roles
- [ ] Required pet fields
- [ ] Reminder types
- [ ] Medication rules

### Design

- [ ] Logo or text-only brand
- [ ] Typography
- [ ] Desktop wireframes
- [ ] Mobile wireframes
- [ ] Dashboard design
- [ ] Pet profile design
- [ ] Medication design
- [ ] Alarm popup design

### Database

- [ ] ERD
- [ ] Table definitions
- [ ] Primary keys
- [ ] Foreign keys
- [ ] Indexes
- [ ] Audit fields

### Backend

- [ ] API endpoint list
- [ ] Authentication method
- [ ] Validation rules
- [ ] Upload architecture
- [ ] Reminder scheduling design
- [ ] Error-response format

### Frontend

- [ ] Route list
- [ ] Component architecture
- [ ] Form validation
- [ ] State management approach
- [ ] Responsive rules
- [ ] Notification handling

### Testing

- [ ] Functional test cases
- [ ] Alarm test cases
- [ ] Upload test cases
- [ ] Authentication test cases
- [ ] Authorization test cases
- [ ] Mobile test cases

---

# 48. Definition of Done

A feature is only considered complete when:

- [ ] Requirement is implemented
- [ ] UI matches PawCare design guidelines
- [ ] Mobile layout works
- [ ] Validation is implemented
- [ ] Backend authorization is implemented
- [ ] Error states are handled
- [ ] Loading states are handled
- [ ] Empty states are handled
- [ ] Relevant test cases pass
- [ ] No critical console errors exist
- [ ] Code has been committed to Git

---

# 49. Initial Development Priority

The recommended first major milestone is:

```text
Authentication
      ↓
Household
      ↓
Pet Profile
      ↓
Pet Photo Upload
      ↓
Medication
      ↓
Medication Schedule
      ↓
Reminder Engine
      ↓
In-App Alarm
      ↓
Medication Completion Log
```

Once this workflow works reliably, the other modules can be added around it.

---

# 50. Project Principle

PawCare should prioritize:

> **Care first, simplicity second, features third.**

The application should help a family answer three questions immediately:

1. **What does my pet need today?**
2. **When does my pet need it?**
3. **Has someone already done it?**

That should guide every future feature and design decision.

---

## Current Status

**Concept:** Approved  
**Platform:** Web Application  
**Design:** Minimalist Black & White  
**Pet Photo Upload:** Required  
**Medication/Care Alarm:** Required  
**Requirements Documentation:** Initial Draft Completed  
**MFA:** Required in the working MVP design  
**System Design:** See companion document for ERD, table design, API contracts, flows, UI specification, and acceptance tests  
**Implementation:** Source, full initial database, and targeted automated tests completed  
**Next Task:** Configure the local database and create your own account; then verify the app on your devices using the included setup guide.


---

# 51. Clarifications for Implementation

## Delivery boundaries

The latest request expanded delivery to the whole system. The source includes all MVP modules plus feeding plans, grooming records, and expenses. Background Web Push, SMS, AI features, and report-generation enhancements remain future work. The interface links to implemented modules.

## Records and examples

Existing names, ages, drug names, doses, health facts, and dates in this document are interface examples, not confirmed records or prescriptions for Cha Cha. Production starts with no sample medical records. Users enter the instructions supplied by their veterinarian.

## Medication and reminder state

- A schedule describes repetition; an occurrence represents one expected dose or care task.
- Medication occurrences use a separate medication log for Given or Skipped, with who and when.
- Upcoming, Due, Overdue, and Late describe timing; they do not prove administration.
- Dismiss only silences that alert. It leaves the occurrence unresolved and visible in Today's Care.
- Snooze changes the next alert time for that occurrence. It never shifts the prescription schedule or the next dose.
- Do not infer a missed or administered dose from a closed browser, a dismissal, or an elapsed timer. Show unresolved doses as Overdue until a person records the outcome.
- Prevent duplicate logs with an occurrence-level unique constraint and a transactional state change.
- Cancelling or editing a schedule preserves past occurrences and completion history; only future pending occurrences may change.
- Completed-by names come from the authenticated session, not from a submitted user ID.

## Reminder coverage

For MVP, support once, daily at one or more selected times, fixed intervals in hours, weekly, selected weekdays, and monthly on a selected day. A custom interval means a validated whole-hour interval in this release. Monthly dates that do not exist in a month move to that month's last calendar day, with a preview before saving.

Fixed local clock times use the household timezone. Every-X-hours schedules use elapsed time from a stored UTC anchor. Asia/Manila is the default. Preserve a timezone snapshot per schedule; changing the household timezone must not silently move an existing medication schedule.

## Alarm coverage

The app must show an Enable reminder sounds control and handle refused audio playback. Due-task sound is supported while the page is open, active, authenticated, sound-enabled, and the device/browser permits playback. Background tabs, sleeping devices, closed pages, muted devices, connectivity loss, and expired sessions can interrupt alerts. On return, retrieve and show unresolved due occurrences without replaying every old sound. Browser autoplay behavior is described by [MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).

Setting up a service worker alone does not deliver scheduled notifications with the app closed. Closed-app reminders remain a later server-scheduled Web Push feature.

## Family and data protection

One active household per user is the MVP UI rule. Each member has a separate account and MFA factor. Admins manage membership and schedules; members view shared records, add permitted notes/files, and record care completion. The companion permission matrix is authoritative for this version. Keep at least one active household admin, including when two role-change requests run concurrently.

Pet images and documents are private. Store an object key and metadata in the database, not a public permanent URL or the file bytes. Check active household membership for every upload and download, even when someone guesses a file ID.

## Verification status

The earlier phase checklists remain a planning record. The delivered source was built and its initial database created for integration testing. Seventeen API/database scenarios and twelve unit checks passed, including MFA, household isolation, private uploads, duplicate-dose protection, and scheduling. Browser sound tests, exact MySQL version testing, production SMTP, deployment, and backup restoration still need validation in the target environment. See the companion design and the packaged docs/VERIFICATION.md for precise boundaries.
