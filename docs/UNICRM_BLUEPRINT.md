\# UniCRM V1 — Product \& Technical Blueprint



\*\*Product:\*\* UniCRM

\*\*Owner:\*\* UnicodeIT

\*\*Initial use:\*\* Internal UnicodeIT CRM and project operations

\*\*Future direction:\*\* Multi-tenant SaaS CRM for software agencies, digital agencies, and service companies

\*\*Architecture:\*\* Modular monolith, API-first, multi-tenant-ready



\---



\# 1. Product Objective



UniCRM should provide one clean workspace for managing:



\* Leads

\* Prospective clients

\* Existing clients

\* Contacts

\* Follow-ups

\* Sales pipeline

\* Projects

\* Tasks

\* Quotations

\* Payments

\* Team assignments

\* Activity history

\* Basic reporting



The primary V1 principle is:



> Simple enough that UnicodeIT employees actually use it every day.



UniCRM should avoid becoming an ERP, accounting system, HR system, support desk, or marketing automation platform during V1.



\---



\# 2. Primary Business Flow



The central UniCRM lifecycle will be:



```text

Lead

&#x20; ↓

Contacted

&#x20; ↓

Qualified

&#x20; ↓

Proposal Sent

&#x20; ↓

Negotiation

&#x20; ↓

Won

&#x20; ↓

Client

&#x20; ↓

Project

&#x20; ↓

Tasks

&#x20; ↓

Delivery

&#x20; ↓

Payment

&#x20; ↓

Completed

```



A lost lead remains available for reporting and future reactivation.



```text

Lead

&#x20; ↓

Lost

&#x20; ↓

Archived / Future Follow-up

```



\---



\# 3. UniCRM V1 Modules



\## Dashboard



Shows actionable information instead of decorative analytics.



Core widgets:



```text

Open Leads

Active Projects

Tasks Due Today

Overdue Tasks

Upcoming Follow-ups

Outstanding Payments

Recent Activity

My Tasks

```



\---



\## CRM



\### Leads



Manage prospective customers.



Fields:



```text

Name

Company

Email

Phone

Lead source

Pipeline stage

Estimated value

Owner

Priority

Next follow-up

Notes

Created date

Last activity

```



\### Companies



Represents client or prospect organizations.



Fields:



```text

Company name

Website

Email

Phone

Address

Industry

Client status

Account owner

Notes

```



\### Contacts



Individual people associated with companies.



Fields:



```text

First name

Last name

Company

Job title

Email

Phone

Primary contact

Notes

```



\### Activities



Supported activity types:



```text

Call

Meeting

Email

Note

Follow-up

Status change

System activity

```



\---



\# 4. Sales Pipeline



Default pipeline:



```text

New Lead

Contacted

Qualified

Proposal Sent

Negotiation

Won

Lost

```



V1 will use one standard pipeline.



Later versions may support:



```text

Multiple pipelines

Custom stages

Custom probabilities

Pipeline automation

```



These are NOT required for V1.



\---



\# 5. Projects



A project is created only after a lead/client relationship reaches the appropriate point.



Project fields:



```text

Project name

Client

Project manager

Team members

Description

Start date

Deadline

Status

Priority

Project value

Progress

Notes

```



Default project statuses:



```text

Planned

In Progress

On Hold

In Review

Completed

Cancelled

```



\---



\# 6. Tasks



Task fields:



```text

Title

Description

Project

Assignee

Reporter

Priority

Status

Start date

Due date

Estimated time

Completed date

```



Default task statuses:



```text

To Do

In Progress

In Review

Completed

Blocked

```



Priorities:



```text

Low

Medium

High

Urgent

```



V1 task functionality:



```text

Create

Edit

Assign

Reassign

Comment

Change status

Set deadline

Mark complete

Filter

Search

```



No Jira-style workflow builder in V1.



\---



\# 7. Quotations



UniCRM should generate basic client quotations.



Quotation:



```text

Quotation number

Client

Contact

Project / Lead

Issue date

Expiry date

Currency

Status

Subtotal

Discount

Tax

Total

Notes

Terms

```



Quotation items:



```text

Description

Quantity

Unit price

Amount

```



Statuses:



```text

Draft

Sent

Accepted

Rejected

Expired

```



\---



\# 8. Payment Tracking



UniCRM V1 will track payments.



It will NOT attempt to become accounting software.



Payment fields:



```text

Client

Project

Quotation

Amount

Payment date

Payment method

Reference

Notes

Recorded by

```



Project financial summary:



```text

Project Value:       ৳150,000

Received:            ৳100,000

Outstanding:          ৳50,000

```



\---



\# 9. Users and Access Control



UniCRM will use permission-based RBAC.



Default roles:



```text

Owner

Admin

Manager

Staff

Viewer

```



Roles are convenient presets.



Permissions are the actual authorization mechanism.



Examples:



```text

lead.create

lead.read

lead.update

lead.delete



company.create

company.read

company.update

company.delete



contact.create

contact.read

contact.update

contact.delete



project.create

project.read

project.update

project.delete



task.create

task.read

task.update

task.assign

task.delete



quotation.create

quotation.read

quotation.update

quotation.approve



payment.create

payment.read

payment.update



user.invite

user.read

user.update

user.disable



role.manage



settings.read

settings.update



reports.read

```



Backend authorization must enforce permissions.



Frontend menu visibility is NOT considered security.



\---



\# 10. Multi-Tenant Foundation



Although UnicodeIT will initially be the only organization, UniCRM will support an organization boundary from day one.



```text

Organization

&#x20;   │

&#x20;   ├── Users

&#x20;   ├── Leads

&#x20;   ├── Companies

&#x20;   ├── Contacts

&#x20;   ├── Projects

&#x20;   ├── Tasks

&#x20;   ├── Quotations

&#x20;   └── Payments

```



Example:



```text

UnicodeIT

organization\_id = org\_01

```



Future SaaS:



```text

UnicodeIT       → org\_01

Agency ABC      → org\_02

Software XYZ    → org\_03

```



Most business tables will therefore contain:



```text

organization\_id

```



Every API query must validate organization scope.



\---



\# 11. Authentication Architecture



Authentication will be first-party and owned by UniCRM.



No:



```text

Clerk

Auth0

Firebase Auth

Supabase Auth

Better Auth

```



Architecture:



```text

Browser

&#x20;  │

&#x20;  │ Secure HttpOnly Cookie

&#x20;  ▼

NestJS

&#x20;  │

&#x20;  ├── Auth Module

&#x20;  ├── Session Module

&#x20;  ├── Permission Guard

&#x20;  └── Security Events

&#x20;          │

&#x20;          ▼

&#x20;      PostgreSQL

```



Use server-side sessions.



Do NOT store authentication tokens in:



```text

localStorage

sessionStorage

```



Session token flow:



```text

Login

&#x20;↓

Generate cryptographically secure random token

&#x20;↓

Browser receives raw token through HttpOnly cookie

&#x20;↓

Database stores only token hash

```



Password hashing:



```text

Argon2id

```



UniCRM itself manages:



```text

Users

Password hashes

Sessions

Invitations

Password resets

Email verification

Roles

Permissions

Security events

```



\---



\# 12. User Account Lifecycle



Account statuses:



```text

INVITED

ACTIVE

SUSPENDED

DISABLED

```



No public signup in V1.



User onboarding:



```text

Admin

&#x20;↓

Invite Employee

&#x20;↓

Email Invitation

&#x20;↓

Employee sets password

&#x20;↓

Account activated

```



\---



\# 13. Database Core



Initial tables:



```text

organizations



users

auth\_sessions

password\_reset\_tokens

email\_verification\_tokens

security\_events



roles

permissions

user\_roles

role\_permissions



companies

contacts



pipelines

pipeline\_stages

leads

lead\_activities



projects

project\_members



tasks

task\_comments



quotations

quotation\_items



payments



attachments

notifications

activity\_logs

```



\---



\# 14. Simplified Entity Relationship Model



```text

Organization

│

├── Users

│    ├── UserRoles

│    ├── Sessions

│    └── SecurityEvents

│

├── Companies

│    ├── Contacts

│    ├── Projects

│    ├── Quotations

│    └── Payments

│

├── Leads

│    ├── PipelineStage

│    ├── Owner

│    └── Activities

│

├── Projects

│    ├── ProjectMembers

│    ├── Tasks

│    │    └── Comments

│    ├── Attachments

│    └── Payments

│

└── ActivityLogs

```



\---



\# 15. Core ID Strategy



Prefer globally unique IDs.



Example:



```text

org\_...

usr\_...

lead\_...

company\_...

contact\_...

project\_...

task\_...

quote\_...

payment\_...

```



Database IDs may internally use UUIDs.



Human-friendly references can be generated separately.



Examples:



```text

LEAD-000021

PRJ-000104

QT-000042

PAY-000018

```



\---



\# 16. Technology Stack



\## Language



```text

TypeScript

```



Frontend and backend both use TypeScript.



\---



\## Frontend



```text

Next.js

React

TypeScript

Tailwind CSS

shadcn/ui

Base UI

TanStack Table

TanStack Query

React Hook Form

Zod

Lucide

```



\---



\## Backend



```text

NestJS

TypeScript

REST API

```



\---



\## Database



```text

PostgreSQL

```



\---



\## ORM



```text

Prisma

```



\---



\## Queue / Cache



```text

Redis

BullMQ

```



Used for:



```text

Email queues

Notifications

Background jobs

Rate limiting

Exports

Future scheduled automation

```



\---



\## File Storage



```text

S3-compatible object storage

```



Database stores file metadata.



Object storage stores actual files.



\---



\# 17. Repository Structure



Use a monorepo:



```text

unicrm/

│

├── apps/

│   │

│   ├── web/

│   │   └── Next.js application

│   │

│   └── api/

│       └── NestJS application

│

├── packages/

│   │

│   ├── ui/

│   ├── types/

│   ├── validation/

│   ├── config/

│   └── eslint-config/

│

├── infrastructure/

│   ├── docker/

│   └── nginx/

│

├── docs/

│

├── package.json

├── pnpm-workspace.yaml

└── turbo.json

```



Use:



```text

pnpm

Turborepo

```



\---



\# 18. Backend Module Structure



```text

apps/api/src/



auth/

users/

organizations/



roles/

permissions/



companies/

contacts/



leads/

pipelines/

activities/



projects/

tasks/



quotations/

payments/



attachments/

notifications/



reports/

audit/



common/

database/

config/

```



Each business module should contain its own:



```text

controller

service

DTOs

repository/data access

validators

policies/permissions

tests

```



\---



\# 19. API Architecture



Use REST initially.



Example authentication endpoints:



```text

POST   /api/v1/auth/login

POST   /api/v1/auth/logout

GET    /api/v1/auth/me

POST   /api/v1/auth/forgot-password

POST   /api/v1/auth/reset-password



GET    /api/v1/auth/sessions

DELETE /api/v1/auth/sessions/:id

```



Users:



```text

GET    /api/v1/users

POST   /api/v1/users/invite

GET    /api/v1/users/:id

PATCH  /api/v1/users/:id

```



Leads:



```text

GET    /api/v1/leads

POST   /api/v1/leads

GET    /api/v1/leads/:id

PATCH  /api/v1/leads/:id

DELETE /api/v1/leads/:id



POST   /api/v1/leads/:id/activities

GET    /api/v1/leads/:id/activities

```



Projects:



```text

GET    /api/v1/projects

POST   /api/v1/projects

GET    /api/v1/projects/:id

PATCH  /api/v1/projects/:id

```



Tasks:



```text

GET    /api/v1/tasks

POST   /api/v1/tasks

GET    /api/v1/tasks/:id

PATCH  /api/v1/tasks/:id

POST   /api/v1/tasks/:id/comments

```



Use:



```text

/api/v1/

```



from the beginning.



\---



\# 20. Web Application Sitemap



```text

/login

/forgot-password

/reset-password

/invitation



/app

│

├── dashboard

│

├── leads

│   └── \[leadId]

│

├── companies

│   └── \[companyId]

│

├── contacts

│   └── \[contactId]

│

├── projects

│   └── \[projectId]

│

├── tasks

│

├── quotations

│   └── \[quotationId]

│

├── payments

│

├── reports

│

└── settings

&#x20;   ├── organization

&#x20;   ├── users

&#x20;   ├── roles

&#x20;   ├── security

&#x20;   └── preferences

```



\---



\# 21. Main Application Navigation



```text

UniCRM



Overview



CRM

&#x20; Leads

&#x20; Companies

&#x20; Contacts



Projects

&#x20; Projects

&#x20; Tasks



Sales

&#x20; Quotations

&#x20; Payments



Reports



────────────────



Settings

```



Do not expose dozens of menu items.



\---



\# 22. Application Shell



Desktop:



```text

┌──────────────────────────────────────────────────────────────────┐

│ UniCRM          Search...             + Create        🔔     ZH  │

├─────────────────┬────────────────────────────────────────────────┤

│                 │                                                │

│ Overview        │                                                │

│                 │                                                │

│ CRM             │                                                │

│   Leads         │                                                │

│   Companies     │                 PAGE CONTENT                   │

│   Contacts      │                                                │

│                 │                                                │

│ Projects        │                                                │

│   Projects      │                                                │

│   Tasks         │                                                │

│                 │                                                │

│ Sales           │                                                │

│   Quotations    │                                                │

│   Payments      │                                                │

│                 │                                                │

│ Reports         │                                                │

│                 │                                                │

│ ──────────────  │                                                │

│ Settings        │                                                │

└─────────────────┴────────────────────────────────────────────────┘

```



Sidebar must be collapsible.



\---



\# 23. UI Design Direction



UniCRM should feel:



```text

Modern

Minimal

Fast

Professional

Dense

Calm

Premium

```



Design references:



```text

Attio

Linear

Stripe

Notion

Twenty

```



Do not clone any of them.



UniCRM should develop its own identity.



\---



\# 24. UI Rules



Avoid:



```text

Huge headings

Huge cards

Heavy shadows

Extreme gradients

Excessive colors

Excessive rounded corners

AdminLTE style

Bootstrap-looking components

Decorative charts

Unnecessary animations

```



Prefer:



```text

Subtle borders

Clean typography

Compact forms

Dense tables

Whitespace

Clear hierarchy

One brand accent

Fast interactions

Drawers

Command palette

Useful keyboard shortcuts

```



\---



\# 25. Design Tokens



Initial direction:



```css

:root {

&#x20; --background: #f8f9fb;

&#x20; --surface: #ffffff;



&#x20; --foreground: #18181b;

&#x20; --muted-foreground: #71717a;



&#x20; --border: #e4e4e7;



&#x20; --primary: #5b5bd6;



&#x20; --success: #16a34a;

&#x20; --warning: #d97706;

&#x20; --danger: #dc2626;



&#x20; --radius-sm: 6px;

&#x20; --radius-md: 8px;

&#x20; --radius-lg: 12px;

}

```



These values are an initial direction, not permanent branding.



\---



\# 26. Typography



Primary recommendation:



```text

Geist

```



Suggested scale:



```text

Page title      24px / 600

Section title   16px / 600

Body            14px / 400

Table           13–14px

Metadata        12px

```



\---



\# 27. UI Component Library



Create:



```text

packages/ui

```



Components:



```text

Button

IconButton



Input

Textarea

Select

Combobox

Checkbox

Radio

Switch



DatePicker

DateRangePicker

MoneyInput

PhoneInput



Badge

StatusBadge

Avatar



Card

Metric

PageHeader



DataTable

Pagination



Dialog

Drawer

Popover

Tooltip

DropdownMenu



Tabs



CommandMenu



EmptyState

ErrorState

LoadingState

Skeleton



ActivityTimeline

ActivityItem



UserPicker

CompanyPicker

ContactPicker



FileUploader



Toast

ConfirmationDialog

```



\---



\# 28. UI Kit Page



Create:



```text

/app/ui-kit

```



Development access only.



It should display all:



```text

Colors

Typography

Spacing

Buttons

Forms

Badges

Tables

Dialogs

Drawers

Tabs

Menus

Empty states

Loading states

Status states

```



This becomes UniCRM's code-first design reference.



\---



\# 29. Leads Screen



Example:



```text

Leads                                                + New Lead



All     My Leads     Follow-up Due     Won



Search leads...      Stage ▾    Owner ▾    Source ▾    Filters



┌────┬─────────────────┬──────────────┬─────────────┬─────────┬─────────┐

│    │ Lead            │ Company      │ Stage       │ Value   │ Owner   │

├────┼─────────────────┼──────────────┼─────────────┼─────────┼─────────┤

│ □  │ John Smith      │ ABC Ltd      │ Qualified   │ $4,200  │ Hossain │

│ □  │ Sarah Ahmed     │ Nova Inc     │ Proposal    │ $8,500  │ Rafi    │

└────┴─────────────────┴──────────────┴─────────────┴─────────┴─────────┘

```



Capabilities:



```text

Search

Sort

Filter

Pagination

Bulk selection

Saved views

Column customization

```



\---



\# 30. Record Page Pattern



UniCRM should use one consistent record pattern.



Example:



```text

ABC Technologies



Overview    Activity    Projects    Quotes    Payments



┌────────────────────────────┬─────────────────────────────────┐

│ COMPANY                    │ ACTIVITY                        │

│                            │                                 │

│ Website                    │ Today                           │

│ Industry                   │ Meeting completed               │

│ Account Owner              │                                 │

│ Status                     │ Yesterday                       │

│                            │ Quotation sent                  │

│ PRIMARY CONTACT            │                                 │

│ John Smith                 │ Aug 28                          │

│ john@example.com           │ Follow-up created               │

└────────────────────────────┴─────────────────────────────────┘

```



Reuse this pattern for:



```text

Lead

Company

Project

Quotation

```



\---



\# 31. Quick View Drawer



Tables should support quick access without constant navigation.



```text

Lead List                   Lead Details

─────────────────────┬───────────────────────────────

John Smith           │ John Smith

Sarah Ahmed          │ ABC Ltd

Mike Rahman          │

&#x20;                    │ Qualified

&#x20;                    │

&#x20;                    │ Estimated value

&#x20;                    │ ৳250,000

&#x20;                    │

&#x20;                    │ Owner

&#x20;                    │ Hossain

&#x20;                    │

&#x20;                    │ Next follow-up

&#x20;                    │ Sep 3

&#x20;                    │

&#x20;                    │ \[Open full record]

```



\---



\# 32. Global Command Palette



Shortcut:



```text

Ctrl + K

⌘ + K

```



Examples:



```text

Create Lead

Create Company

Create Project

Create Task



Search MediTrust



Go to Projects

Go to Payments

Go to Settings

```



\---



\# 33. Dashboard



Dashboard should answer:



```text

What needs attention today?

```



Example:



```text

Dashboard



Open Leads          Active Projects        Outstanding

24                  8                      ৳185,000



Tasks Due Today     Overdue Tasks

6                   3



────────────────────────────────────────



My Tasks



Checkout issue                     Today

CRM authentication                 Today

Client proposal                    Tomorrow



────────────────────────────────────────



Upcoming Follow-ups



ABC Ltd                            2:00 PM

Nova Software                      Tomorrow



────────────────────────────────────────



Recent Activity



12:35  Proposal QT-004 sent

11:20  Payment ৳45,000 recorded

10:15  Project assigned to Hossain

```



\---



\# 34. Activity System



Activity history should be first-class.



Table:



```text

activity\_logs



id

organization\_id

actor\_id

entity\_type

entity\_id

action

metadata

created\_at

```



Example events:



```text

Lead created



Lead moved:

Qualified → Proposal Sent



Project created



Task assigned to Hossain



Quotation sent



Payment ৳50,000 received



Document uploaded

```



Useful later for:



```text

Audit

Client history

Notifications

Reports

AI summaries

```



\---



\# 35. Notifications



V1 notifications:



```text

Task assigned

Task overdue

Project deadline approaching

Follow-up due

Quotation accepted

Payment recorded

User mentioned

```



Notification center:



```text

Unread

All

```



Email notifications can be configurable later.



\---



\# 36. Search



V1 global search should eventually search:



```text

Leads

Companies

Contacts

Projects

Tasks

Quotations

```



Result grouping:



```text

Companies

&#x20;   MediTrust International



Projects

&#x20;   MediTrust Website



Contacts

&#x20;   John Smith

```



\---



\# 37. Reports



Keep V1 reports simple.



Reports:



```text

Lead pipeline

Lead conversion

Leads by source

Projects by status

Tasks by status

Overdue tasks

Payments received

Outstanding balances

```



Avoid building a generic BI/dashboard builder.



\---



\# 38. Security Requirements



Mandatory:



```text

HTTPS only



Argon2id password hashing



Secure random session tokens



HttpOnly cookies



Secure cookies



SameSite protection



CSRF protection



Server-side authorization



Tenant isolation



Login rate limiting



Password reset expiration



Session revocation



Audit logging



Secure file upload validation



Request validation



Database backups



Secrets outside source control



No plain-text credentials



No authentication tokens in localStorage

```



\---



\# 39. Docker Architecture



Development:



```text

Docker Compose



┌──────────────────┐

│ web              │

│ Next.js          │

└──────────────────┘



┌──────────────────┐

│ api              │

│ NestJS           │

└──────────────────┘



┌──────────────────┐

│ postgres         │

└──────────────────┘



┌──────────────────┐

│ redis            │

└──────────────────┘

```



Production:



```text

Internet

&#x20;  ↓

Reverse Proxy

&#x20;  ↓

crm.domain.com

&#x20;  │

&#x20;  ├── /api/\* ──────→ NestJS

&#x20;  │

&#x20;  └── /\* ──────────→ Next.js

&#x20;                       │

&#x20;                       ├── PostgreSQL

&#x20;                       ├── Redis

&#x20;                       └── S3

```



\---



\# 40. Deployment Principle



Externally prefer:



```text

https://crm.unicodeit.com

```



with:



```text

/api/\*

```



on the same origin.



Example:



```text

https://crm.unicodeit.com/leads



https://crm.unicodeit.com/api/v1/leads

```



This simplifies:



```text

Cookies

CORS

CSRF

Deployment

Security

```



\---



\# 41. Development Strategy



Build one vertical slice completely before starting another.



Bad approach:



```text

Lead page 30%

Project page 30%

Dashboard 40%

Payments 20%

Tasks 30%

```



Preferred:



```text

Leads



Database

✓



API

✓



Permissions

✓



UI

✓



Validation

✓



Activity log

✓



Tests

✓



Then move on.

```



\---



\# 42. Development Milestones



\## Milestone 0 — Foundation



```text

Monorepo

Next.js

NestJS

PostgreSQL

Prisma

Redis

Docker

Environment configuration

Linting

Formatting

Testing foundation

```



\---



\## Milestone 1 — UI Foundation



```text

Design tokens

UI package

UI kit

Application shell

Sidebar

Topbar

Responsive structure

Dark mode

Command palette skeleton

```



\---



\## Milestone 2 — Authentication



```text

Organization

Users



Custom authentication

Login

Logout

Sessions



Password reset

Invitations



Roles

Permissions



Security events

```



\---



\## Milestone 3 — CRM Core



```text

Companies

Contacts

Leads

Pipeline stages

Activities

Follow-ups

```



\---



\## Milestone 4 — Projects



```text

Projects

Project members

Tasks

Comments

Attachments

Activity timeline

```



\---



\## Milestone 5 — Sales



```text

Quotations

Quotation items

PDF generation

Payment tracking

Outstanding balances

```



\---



\## Milestone 6 — Operational UI



```text

Dashboard

Notifications

Global search

Reports

Saved filters/views

```



\---



\## Milestone 7 — Production Hardening



```text

Permission audit

Tenant-isolation audit

Security testing

Performance review

Database indexes

Backups

Error handling

Logging

Monitoring

Accessibility

Responsive QA

```



\---



\# 43. V1 Non-Goals



Do NOT build these yet:



```text

Payroll

HR

Inventory

Accounting ledger

Email marketing

Campaign management

Helpdesk

Live chat

Workflow designer

Custom fields everywhere

Multiple custom pipelines

Advanced automation

Mobile application

Marketplace

Plugin system

AI agent platform

Complex BI system

Microservices

```



\---



\# 44. Future UniCRM V2+



Possible future capabilities:



```text

Custom fields

Custom pipelines

Custom statuses



Recurring tasks



Calendar integration

Google Workspace

Microsoft 365



Email sync



WhatsApp integration



Client portal



Recurring invoices



Advanced dashboards



Webhooks



Public API



Mobile app



AI summaries



AI follow-up drafts



AI task extraction



Natural-language CRM search



Workflow automation



SaaS subscriptions



Per-organization branding



Custom domains

```



Only implement these after actual UniCRM usage validates the need.



\---



\# 45. Product Positioning



Initially:



> UniCRM — UnicodeIT's internal client, sales, project, and delivery workspace.



Possible commercial positioning later:



> UniCRM — CRM and project operations software for modern software and digital agencies.



The commercial value proposition would be:



```text

Lead

&#x20;→ Client

&#x20;→ Project

&#x20;→ Tasks

&#x20;→ Delivery

&#x20;→ Payment

```



in one uncomplicated platform.



\---



\# 46. Architectural Principle



UniCRM V1 should be:



```text

Simple product

\+

Clean architecture

\+

Strong data model

\+

Multi-tenant foundation

\+

First-party authentication

\+

Modern UI

```



not:



```text

Maximum features

\+

Maximum abstraction

\+

Maximum configuration

```



\---



\# 47. First Development Sprint



The first actual implementation work should now be:



```text

01\. Create GitHub repository: UniCRM



02\. Initialize pnpm monorepo



03\. Configure Turborepo



04\. Create:

&#x20;   apps/web

&#x20;   apps/api

&#x20;   packages/ui

&#x20;   packages/types

&#x20;   packages/validation

&#x20;   packages/config



05\. Configure Next.js



06\. Configure NestJS



07\. Add PostgreSQL



08\. Configure Prisma



09\. Add Redis



10\. Create Docker Compose



11\. Create environment handling



12\. Configure:

&#x20;   ESLint

&#x20;   Prettier

&#x20;   TypeScript

&#x20;   testing



13\. Create initial organization schema



14\. Create user schema



15\. Create auth session schema



16\. Create roles and permissions schema



17\. Create /ui-kit



18\. Build UniCRM application shell



19\. Build login UI



20\. Implement authentication

```



Do not create Leads, Projects, Quotations, or Dashboard business logic until this foundation is working correctly.



\---



\# 48. Definition of Foundation Complete



Milestone 0–2 are complete when:



```text

docker compose up

```



starts the system successfully.



You can open:



```text

UniCRM login

```



Admin can log in.



The server creates and validates a secure session.



Admin can:



```text

Invite user

View users

Assign role

Disable user

View active sessions

Revoke session

```



Permission guards work.



Organization isolation exists.



The application shell works.



The UI kit exists.



Then development moves to:



```text

Companies

Contacts

Leads

```



\---



\# Final Architecture



```text

&#x20;                        UniCRM



&#x20;                          │

&#x20;                    Next.js Web

&#x20;                          │

&#x20;                   HTTPS / Cookie

&#x20;                          │

&#x20;                          ▼

&#x20;                      NestJS API

&#x20;                          │

&#x20;       ┌──────────────────┼──────────────────┐

&#x20;       │                  │                  │

&#x20;    Auth/RBAC          Business          Background

&#x20;       │                Modules              Jobs

&#x20;       │                  │                  │

&#x20;       └──────────────────┼──────────────────┘

&#x20;                          │

&#x20;                        Prisma

&#x20;                          │

&#x20;                    PostgreSQL

&#x20;                          │

&#x20;               ┌──────────┴─────────┐

&#x20;               │                    │

&#x20;             Redis                 S3

```



The next implementation target is therefore:



> \*\*UniCRM Foundation: monorepo + Docker + Next.js + NestJS + PostgreSQL + Prisma + Redis + UI system + custom authentication + organization/roles/permissions.\*\*



