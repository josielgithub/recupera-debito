CREATE TABLE `investidores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`percentual_participacao` decimal(5,2),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `investidores_id` PRIMARY KEY(`id`),
	CONSTRAINT `investidores_nome_unique` UNIQUE(`nome`)
);
--> statement-breakpoint
ALTER TABLE `processos` ADD `investidor_id` int;