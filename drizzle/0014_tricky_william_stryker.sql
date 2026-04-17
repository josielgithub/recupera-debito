CREATE TABLE `configuracoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chave` varchar(128) NOT NULL,
	`valor` text NOT NULL,
	`atualizado_em` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`atualizado_por` int,
	CONSTRAINT `configuracoes_id` PRIMARY KEY(`id`),
	CONSTRAINT `configuracoes_chave_unique` UNIQUE(`chave`)
);
