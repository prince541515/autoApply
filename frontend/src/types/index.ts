export interface User {
  id: string;
  email: string;
  role: "admin" | "candidate";
  is_active: boolean;
  account_status: "pending" | "active" | "paused" | "suspended";
  auto_apply_allowed?: boolean | null;
  auto_apply_enabled?: boolean | null;
  created_at?: string;
}

export interface ExperienceEntry {
  company: string;
  title: string;
  start_date: string;
  end_date: string;
  description: string;
}

export interface EducationEntry {
  institution: string;
  degree: string;
  field: string;
  year: string;
}

export interface CandidateProfile {
  id: string;
  user_id: string;
  created_by: string | null;
  full_name: string;
  phone: string | null;
  location: string | null;
  skills: string[] | null;
  experience: ExperienceEntry[] | null;
  education: EducationEntry[] | null;
  resume_url: string | null;
  bio: string | null;
  auto_apply_enabled: boolean;
  auto_apply_allowed?: boolean;
  created_at: string;
}

export interface AdminCandidate {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  location?: string | null;
  skills?: string[] | null;
  account_status: "pending" | "active" | "paused" | "suspended";
  plan: "premium" | "basic";
  auto_apply_enabled: boolean;
  auto_apply_allowed: boolean;
  beat_scrape_interval_minutes?: number | null;
  last_beat_scrape_at?: string | null;
  daily_scrape_limit?: number | null;
  application_count: number;
  fetch_times: number;
  jobs_fetched: number;
  apply_clicks: number;
  created_at: string | null;
}

export interface InviteCode {
  id: string;
  code: string;
  created_by: string;
  used_by: string | null;
  used_at: string | null;
  created_at: string | null;
  used: boolean;
}

export interface CandidateActivityEvent {
  id: string;
  event_type: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
}

export interface CandidateActivityApplication {
  id: string;
  status: string;
  portal: string;
  applied_at: string | null;
  created_at: string | null;
  job: {
    id: string;
    title: string;
    company: string;
    portal: string;
    location: string | null;
    url: string;
  } | null;
}

export interface CandidateActivity {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  location?: string | null;
  account_status: string;
  plan?: "premium" | "basic";
  auto_apply_allowed: boolean;
  auto_apply_enabled: boolean;
  beat_scrape_interval_minutes?: number | null;
  last_beat_scrape_at?: string | null;
  daily_scrape_limit?: number | null;
  scrape_quota?: {
    limit: number;
    used: number;
    remaining: number;
    resets_at: string;
  };
  application_count: number;
  applied_count: number;
  applications_by_status: Record<string, number>;
  fetch_times: number;
  jobs_fetched: number;
  apply_clicks: number;
  auto_applies: number;
  last_fetch_at: string | null;
  last_apply_click_at: string | null;
  last_auto_apply_at: string | null;
  events: CandidateActivityEvent[];
  applications: CandidateActivityApplication[];
  portals: {
    id: string;
    portal: string;
    is_active: boolean;
    last_synced: string | null;
  }[];
  preferences: {
    roles: string[];
    locations: string[];
    job_type: string | null;
    work_mode: string | null;
    industry: string | null;
    min_salary: number | null;
    max_salary: number | null;
  } | null;
}

export interface PlatformStats {
  total_users: number;
  total_candidates: number;
  total_applications: number;
  total_portals: number;
  applications_by_status: Record<string, number>;
}

export interface PortalConnection {
  id: string;
  candidate_id: string;
  portal: string;
  is_active: boolean;
  last_synced: string | null;
  created_at: string;
}

export interface JobPreference {
  id: string;
  candidate_id: string;
  roles: string[];
  locations: string[];
  min_salary: number | null;
  max_salary: number | null;
  job_type: string;
  work_mode: string;
  excluded_companies: string[];
    required_skills: string[];
  min_experience_years: number | null;
  max_experience_years: number | null;
  include_fresher?: boolean;
  industry?: string | null;
}

export interface JobListing {
  id: string;
  external_id: string;
  portal: string;
  title: string;
  company: string;
  location: string | null;
  description: string | null;
  salary_min: number | null;
  salary_max: number | null;
  url: string;
  posted_at: string | null;
  scraped_at: string;
}

export interface MatchedJob extends JobListing {
  match_score: number;
  application_status: string | null;
}

export interface JobListResponse {
  jobs: JobListing[];
  total: number;
}

export interface MatchedJobListResponse {
  jobs: MatchedJob[];
  total: number;
}

export interface ScrapeResponse {
  message: string;
  task_id: string | null;
  new_jobs: number;
  remaining?: number | null;
  limit?: number | null;
  used?: number | null;
}

export interface ScrapeQuota {
  limit: number;
  used: number;
  remaining: number;
  resets_at: string;
}

export interface Application {
  id: string;
  candidate_id: string;
  job_id: string;
  status: string;
  portal: string;
  external_app_id: string | null;
  apply_response: string | null;
  applied_at: string;
  status_updated_at: string;
  created_at: string;
  job?: JobListing;
}

export interface DashboardStats {
  total_applications: number;
  applied_count: number;
  shortlisted_count: number;
  rejected_count: number;
  interview_count: number;
  active_portals: number;
  success_rate: number;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  role?: string;
  account_status?: string;
}

export interface ChartDataPoint {
  date: string;
  count: number;
}

export interface PortalDistribution {
  portal: string;
  count: number;
  percentage: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
}

export interface PipelineStage {
  stage: string;
  count: number;
  percentage: number;
}

export interface ActivityItem {
  id: string;
  job_title: string;
  company: string;
  portal: string;
  old_status: string;
  new_status: string;
  timestamp: string;
}

export interface AdminStats {
  total_candidates: number;
  active_auto_apply: number;
  total_applications_today: number;
  overall_success_rate: number;
}

export interface DashboardStatsWithTrends extends DashboardStats {
  total_applications_trend: number;
  shortlisted_trend: number;
  interview_trend: number;
  success_rate_trend: number;
}

export interface ApplicationWithJob extends Application {
  job_title: string;
  company: string;
  job_url: string;
  job_description: string | null;
}

export interface PaginatedApplications {
  items: ApplicationWithJob[];
  total: number;
  page: number;
  per_page: number;
}

export interface AdminTopCandidate {
  id: string;
  full_name: string;
  application_count: number;
  success_rate: number;
}

export interface AdminDashboardData {
  stats: AdminStats;
  activity_over_time: ChartDataPoint[];
  top_candidates: AdminTopCandidate[];
  portal_performance: { portal: string; success_rate: number; total: number }[];
  recent_applications: (ApplicationWithJob & { candidate_name: string })[];
  system_status: {
    active_workers: number;
    queue_depth: number;
    last_scrape_time: string | null;
  };
}
