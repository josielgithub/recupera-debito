import https from "https";

const key = process.env.JUDIT_API_KEY;
if (!key) {
  console.log("ERRO: JUDIT_API_KEY não definida");
  process.exit(1);
}
console.log("JUDIT_API_KEY definida, testando API...");

// Testar endpoint de autenticação da Judit
const options = {
  hostname: "requests.prod.judit.io",
  path: "/v1/process",
  method: "GET",
  headers: {
    "api-key": key,
    "Content-Type": "application/json",
  },
};

const req = https.request(options, (res) => {
  console.log("Status HTTP:", res.status || res.statusCode);
  const code = res.statusCode;
  if (code === 401 || code === 403) {
    console.log("ERRO: API Key inválida ou sem permissão");
    process.exit(1);
  } else if (code === 200 || code === 404 || code === 422) {
    console.log("OK: API Key válida (servidor respondeu)");
  } else {
    console.log("Resposta inesperada:", code, "— pode ser válida");
  }
});

req.on("error", (e) => {
  // Tentar outro endpoint
  console.log("Erro no endpoint /v1/process:", e.message);
  console.log("Tentando endpoint alternativo...");

  const opts2 = {
    hostname: "api.judit.io",
    path: "/v1/process",
    method: "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  };
  const req2 = https.request(opts2, (res2) => {
    console.log("Status HTTP (api.judit.io):", res2.statusCode);
    if (res2.statusCode === 401 || res2.statusCode === 403) {
      console.log("ERRO: API Key inválida");
      process.exit(1);
    } else {
      console.log("OK: API Key parece válida");
    }
  });
  req2.on("error", (e2) => {
    console.log("Erro de rede:", e2.message);
    console.log("Não foi possível validar a key — verifique a URL base da Judit");
  });
  req2.end();
});

req.end();
