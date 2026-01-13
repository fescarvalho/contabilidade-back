// seed.js
const db = require("./db");
const bcrypt = require("bcryptjs");

async function criarClienteTeste() {
  console.log("Criando cliente de teste...");

  const nome = "Padaria do João";
  const email = "joao@padaria.com";
  const senhaAberta = "123456"; // Senha que o João vai usar

  // 1. Criptografar a senha
  const salt = await bcrypt.genSalt(10);
  const senhaHash = await bcrypt.hash(senhaAberta, salt);

  try {
    // 2. Inserir no banco
    await db.query(`INSERT INTO users (nome, email, senha_hash) VALUES ($1, $2, $3)`, [
      nome,
      email,
      senhaHash,
    ]);
    console.log("SUCESSO! Cliente criado.");
    console.log(`Login: ${email}`);
    console.log(`Senha: ${senhaAberta}`);
  } catch (error) {
    if (error.code === "23505") {
      console.log("ERRO: Esse email já existe no banco.");
    } else {
      console.error("Erro ao criar:", error);
    }
  }

  // Encerra o script (senão ele fica rodando pra sempre)
  process.exit();
}

criarClienteTeste();
