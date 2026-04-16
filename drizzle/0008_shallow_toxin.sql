CREATE TABLE `convites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(64) NOT NULL,
	`role_convite` enum('advogado','investidor','advogado_investidor') NOT NULL,
	`gerado_por` int NOT NULL,
	`gerado_em` timestamp NOT NULL DEFAULT (now()),
	`usado_em` timestamp,
	`usado_por` int,
	`ativo` boolean NOT NULL DEFAULT true,
	`expirado_em` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `convites_id` PRIMARY KEY(`id`),
	CONSTRAINT `convites_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `lote_investidores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lote_id` int NOT NULL,
	`investidor_id` int NOT NULL,
	`percentual` decimal(5,2) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lote_investidores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`descricao` text,
	`advogado_id` int,
	`percentual_empresa` decimal(5,2) NOT NULL DEFAULT '0',
	`ativo` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `processos` ADD `advogado_id` int;--> statement-breakpoint
ALTER TABLE `processos` ADD `lote_id` int;--> statement-breakpoint
ALTER TABLE `processos` ADD `status_judit` enum('aguardando_aprovacao_judit','consultado','nao_encontrado') DEFAULT 'aguardando_aprovacao_judit' NOT NULL;--> statement-breakpoint
ALTER TABLE `processos` ADD `aprovado_para_judit_em` timestamp;--> statement-breakpoint
ALTER TABLE `processos` ADD `aprovado_para_judit_por` int;--> statement-breakpoint
ALTER TABLE `processos` ADD `motivo_declinado` text;--> statement-breakpoint
ALTER TABLE `processos` ADD `cliente_pago` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `processos` ADD `data_pagamento_cliente` timestamp;--> statement-breakpoint
ALTER TABLE `processos` ADD `valor_pago_cliente` decimal(15,2);--> statement-breakpoint
ALTER TABLE `users` ADD `foto` varchar(512);--> statement-breakpoint
ALTER TABLE `users` ADD `extra_roles` json DEFAULT ('[]');--> statement-breakpoint
ALTER TABLE `users` ADD `convite_id` int;--> statement-breakpoint
ALTER TABLE `users` ADD `ativo` boolean DEFAULT true NOT NULL;