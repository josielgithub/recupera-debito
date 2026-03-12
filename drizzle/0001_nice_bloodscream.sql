CREATE TABLE `clientes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cpf` varchar(14) NOT NULL,
	`nome` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clientes_id` PRIMARY KEY(`id`),
	CONSTRAINT `clientes_cpf_unique` UNIQUE(`cpf`)
);
--> statement-breakpoint
CREATE TABLE `logs_consulta` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ip_hash` varchar(64) NOT NULL,
	`cpf_hash` varchar(64) NOT NULL,
	`resultado` enum('encontrado','nao_encontrado','bloqueado') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `logs_consulta_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `logs_importacao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome_arquivo` varchar(255),
	`total_linhas` int NOT NULL DEFAULT 0,
	`linhas_ok` int NOT NULL DEFAULT 0,
	`linhas_erro` int NOT NULL DEFAULT 0,
	`detalhes` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `logs_importacao_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parceiros` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome_escritorio` varchar(255) NOT NULL,
	`whatsapp` varchar(30),
	`email` varchar(320),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parceiros_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cnj` varchar(30) NOT NULL,
	`cliente_id` int NOT NULL,
	`parceiro_id` int,
	`advogado` varchar(255),
	`status_resumido` enum('em_analise_inicial','protocolado','em_andamento','aguardando_audiencia','aguardando_sentenca','em_recurso','cumprimento_de_sentenca','concluido_ganho','concluido_perdido','aguardando_documentos','acordo_negociacao','arquivado_encerrado') NOT NULL DEFAULT 'em_analise_inicial',
	`status_interno` varchar(255),
	`monitoramento_ativo` boolean NOT NULL DEFAULT false,
	`codilo_processo_id` varchar(128),
	`ultima_atualizacao_api` timestamp,
	`raw_payload` json,
	`sem_atualizacao_7dias` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processos_id` PRIMARY KEY(`id`),
	CONSTRAINT `processos_cnj_unique` UNIQUE(`cnj`)
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chave` varchar(128) NOT NULL,
	`contador` int NOT NULL DEFAULT 1,
	`janela_inicio` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rate_limits_id` PRIMARY KEY(`id`),
	CONSTRAINT `rate_limits_chave_unique` UNIQUE(`chave`)
);
