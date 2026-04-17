CREATE TABLE `lote_importacao_erros` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lote_id` int NOT NULL,
	`cnj` varchar(50) NOT NULL,
	`motivo` enum('nao_encontrado_banco','processo_ja_em_lote','cnj_invalido') NOT NULL,
	`lote_atual_nome` varchar(255),
	`importado_em` timestamp NOT NULL DEFAULT (now()),
	`resolvido` boolean NOT NULL DEFAULT false,
	`resolvido_em` timestamp,
	`observacao` text,
	CONSTRAINT `lote_importacao_erros_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `lotes` ADD `percentual_advogado` decimal(5,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `lotes` ADD `criado_por` int;