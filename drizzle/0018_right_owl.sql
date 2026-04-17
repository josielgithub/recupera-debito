CREATE TABLE `operacoes_idempotentes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_key` varchar(128) NOT NULL,
	`resultado` text NOT NULL,
	`criado_em` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operacoes_idempotentes_id` PRIMARY KEY(`id`),
	CONSTRAINT `operacoes_idempotentes_request_key_unique` UNIQUE(`request_key`)
);
--> statement-breakpoint
ALTER TABLE `judit_consulta_log` ADD `is_duplicata` boolean DEFAULT false NOT NULL;