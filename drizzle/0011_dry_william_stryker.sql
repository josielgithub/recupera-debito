CREATE TABLE `judit_consulta_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processo_cnj` varchar(30) NOT NULL,
	`request_id` varchar(128),
	`tipo` enum('consulta_avulsa','importacao') NOT NULL DEFAULT 'consulta_avulsa',
	`custo` decimal(10,2) NOT NULL DEFAULT '0.25',
	`status` enum('sucesso','nao_encontrado','erro') NOT NULL DEFAULT 'sucesso',
	`aprovado_por_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `judit_consulta_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `logs_importacao_unificado` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome_arquivo` varchar(255),
	`total_linhas` int NOT NULL DEFAULT 0,
	`linhas_importadas` int NOT NULL DEFAULT 0,
	`linhas_atualizadas` int NOT NULL DEFAULT 0,
	`linhas_erro` int NOT NULL DEFAULT 0,
	`detalhes` json,
	`importado_por_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `logs_importacao_unificado_id` PRIMARY KEY(`id`)
);
