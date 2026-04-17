CREATE TABLE `judit_problemas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processo_cnj` varchar(50) NOT NULL,
	`request_id` varchar(64) NOT NULL,
	`tipo` enum('timeout','nao_encontrado','erro_api','webhook_nao_recebido') NOT NULL,
	`descricao` text NOT NULL,
	`enviado_em` timestamp NOT NULL,
	`detectado_em` timestamp NOT NULL DEFAULT (now()),
	`tentativas` int NOT NULL DEFAULT 1,
	`resolvido` boolean NOT NULL DEFAULT false,
	`resolvido_em` timestamp,
	`observacao` text,
	CONSTRAINT `judit_problemas_id` PRIMARY KEY(`id`)
);
