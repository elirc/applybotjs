CREATE TABLE `jobs` (
	`url` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`salary` text,
	`description` text,
	`location` text,
	`site` text,
	`strategy` text,
	`source` text,
	`discovered_at` integer NOT NULL,
	`full_description` text,
	`application_url` text,
	`detail_scraped_at` integer,
	`detail_error` text,
	`detail_attempts` integer DEFAULT 0 NOT NULL,
	`fit_score` integer,
	`score_reasoning` text,
	`scored_at` integer,
	`score_error` text,
	`score_attempts` integer DEFAULT 0 NOT NULL,
	`tailored_resume_path` text,
	`tailored_resume_text_path` text,
	`tailored_at` integer,
	`tailor_error` text,
	`tailor_attempts` integer DEFAULT 0 NOT NULL,
	`cover_letter_path` text,
	`cover_letter_text_path` text,
	`cover_letter_at` integer,
	`cover_error` text,
	`cover_attempts` integer DEFAULT 0 NOT NULL,
	`resume_pdf_path` text,
	`cover_pdf_path` text,
	`pdf_at` integer,
	`pdf_error` text,
	`pdf_attempts` integer DEFAULT 0 NOT NULL,
	`apply_status` text,
	`apply_error` text,
	`apply_attempts` integer DEFAULT 0 NOT NULL,
	`applied_at` integer,
	`agent_id` text,
	`last_attempted_at` integer,
	`apply_duration_ms` integer,
	`apply_task_id` text
);
--> statement-breakpoint
CREATE INDEX `jobs_fit_score_idx` ON `jobs` (`fit_score`);
--> statement-breakpoint
CREATE INDEX `jobs_apply_status_idx` ON `jobs` (`apply_status`);
--> statement-breakpoint
CREATE INDEX `jobs_discovered_at_idx` ON `jobs` (`discovered_at`);
--> statement-breakpoint
CREATE INDEX `jobs_detail_attempts_idx` ON `jobs` (`detail_attempts`);
--> statement-breakpoint
CREATE INDEX `jobs_score_attempts_idx` ON `jobs` (`score_attempts`);
--> statement-breakpoint
CREATE INDEX `jobs_tailor_attempts_idx` ON `jobs` (`tailor_attempts`);
--> statement-breakpoint
CREATE INDEX `jobs_cover_attempts_idx` ON `jobs` (`cover_attempts`);
--> statement-breakpoint
CREATE INDEX `jobs_pdf_attempts_idx` ON `jobs` (`pdf_attempts`);
--> statement-breakpoint
CREATE INDEX `jobs_apply_attempts_idx` ON `jobs` (`apply_attempts`);
--> statement-breakpoint
CREATE INDEX `jobs_detail_scraped_idx` ON `jobs` (`detail_scraped_at`);
--> statement-breakpoint
CREATE INDEX `jobs_scored_idx` ON `jobs` (`scored_at`);
--> statement-breakpoint
CREATE INDEX `jobs_tailored_idx` ON `jobs` (`tailored_at`);
--> statement-breakpoint
CREATE INDEX `jobs_cover_idx` ON `jobs` (`cover_letter_at`);
--> statement-breakpoint
CREATE INDEX `jobs_pdf_idx` ON `jobs` (`pdf_at`);
