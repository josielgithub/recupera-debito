CREATE TABLE `processo_autos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processo_id` int NOT NULL,
	`attachment_id` varchar(128) NOT NULL,
	`nome_arquivo` varchar(512) NOT NULL,
	`extensao` varchar(20),
	`tamanho_bytes` int,
	`url_s3` varchar(1024) NOT NULL,
	`file_key` varchar(1024) NOT NULL,
	`tipo` varchar(128),
	`data_documento` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `processo_autos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `processos` ADD `autos_disponiveis` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `processos` ADD `autos_solicitado_em` timestamp;--> statement-breakpoint
ALTER TABLE `processos` ADD `autos_disponivel_em` timestamp;