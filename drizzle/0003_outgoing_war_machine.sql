CREATE TABLE `judit_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cnj` varchar(30) NOT NULL,
	`request_id` varchar(128) NOT NULL,
	`status` enum('processing','completed','error') NOT NULL DEFAULT 'processing',
	`processo_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `judit_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `judit_requests_request_id_unique` UNIQUE(`request_id`)
);
--> statement-breakpoint
ALTER TABLE `clientes` MODIFY COLUMN `cpf` varchar(14);--> statement-breakpoint
ALTER TABLE `processos` ADD `status_original` varchar(255);--> statement-breakpoint
ALTER TABLE `processos` ADD `judit_process_id` varchar(128);--> statement-breakpoint
ALTER TABLE `processos` ADD `fonte_atualizacao` enum('judit') DEFAULT 'judit' NOT NULL;--> statement-breakpoint
ALTER TABLE `processos` DROP COLUMN `status_interno`;--> statement-breakpoint
ALTER TABLE `processos` DROP COLUMN `monitoramento_ativo`;--> statement-breakpoint
ALTER TABLE `processos` DROP COLUMN `codilo_processo_id`;