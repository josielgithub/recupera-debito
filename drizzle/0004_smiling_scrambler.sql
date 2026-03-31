ALTER TABLE `processos` ADD `ai_summary` text;--> statement-breakpoint
ALTER TABLE `processos` ADD `ai_summary_updated_at` timestamp;--> statement-breakpoint
ALTER TABLE `parceiros` ADD CONSTRAINT `parceiros_nome_escritorio_unique` UNIQUE(`nome_escritorio`);