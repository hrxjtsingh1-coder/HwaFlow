# Project Context: Automated Manhwa Translation Platform

## 1. System Overview
We are building a multi-tenant, full-stack web application designed for scanlation groups. The platform automates the extraction, translation, and two-step proofreading of manhwa panels. It does not handle typesetting; it strictly outputs translated, localized text for human typesetters. 

**Role of the AI Assistant:** Act as an expert system architect and full-stack developer. Do not generate the entire codebase at once. We will build this iteratively. Wait for specific step-by-step instructions for each phase. Refer to this document for all architectural decisions.

## 2. Tech Stack
- **Frontend & Routing:** Next.js (TypeScript, React)
- **Backend (AI & Image Processing):** Python (FastAPI)
- **Database & Authentication:** Supabase (PostgreSQL, Free Tier)
- **AI/ML Pipeline:** Free models and APIs (e.g., PaddleOCR for Korean text extraction, Gemini/DeepL API for translation and auto-proofreading)

## 3. Core Architecture & User Flow
- **Authentication:** Standard Username/Password credentials via Supabase. No OAuth.
- **Dashboard:** A post-login analytics page featuring widgets for user statistics. Financial widgets track "money earned" visually based on approved chapters (no actual payment processing occurs on the platform).
- **Group System (Multi-Tenant):** Admins create Groups and assign an Owner. Data and series access are strictly isolated per group using Supabase Row Level Security (RLS). Team members join via username invites.
- **Series Interface:** A library dashboard using a tiles-view format. Clicking a series opens a detailed page with a cover banner, synopsis, metadata tags, and a vertically stacked chapter list.
- **Processing Workspace (Two-Step Pipeline):** Clicking a chapter opens the workspace. Users upload raw manhwa panels, which the Next.js frontend sends to the FastAPI backend. The backend executes a two-step AI process: 
    1. Extract the raw text and perform a base translation.
    2. Run a secondary LLM pass strictly for grammar, localization, and natural flow (automated proofreading).
    It then returns the finalized English text.
- **Chapter Approval Workflow:** When a Manager or Owner approves a submitted chapter, the system locks the chapter state and credits the chapter's designated rate to the uploading user's visual dashboard tracker.

## 4. Role-Based Access Control (RBAC)
The application utilizes a three-tier role system within each Group, structured similarly to server moderation hierarchies:
- **Owner (Top Role):** Assigned by the system Admin to the group leader. Possesses all Manager and Staff permissions. Can configure top-level group settings and view all series.
- **Manager (Middle Role):** Assigned by the Owner. Can create new series, create new chapters, and Approve/Disapprove chapters. Can view all series within the group. Managers and Owners assign Staff to specific series either during the initial series setup or via an edit modal on the series page.
- **Staff (Bottom Role):** Default joining role. Can create new chapters within assigned series. Can *only* view series they have been explicitly assigned to.

## 5. UI/UX Design System
The interface must implement a clean, light pastel color palette to provide a premium feel while significantly minimizing eye strain during long workspace sessions.
