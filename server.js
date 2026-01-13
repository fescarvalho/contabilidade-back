require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("./db"); // Importa sua conexão do arquivo db.js

const app = express();

app.use(express.json()); // Para entender JSON
app.use(cors()); // Para o seu Front conseguir acessar

// --- MIDDLEWARE DE SEGURANÇA (O Porteiro) ---
// Essa função verifica se o usuário tem o Token (Crachá) válido
function verificarToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Pega só o código do token

  if (!token) return res.status(401).json({ msg: "Acesso negado!" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id; // Salva o ID do usuário para usar nas rotas
    next();
  } catch (error) {
    res.status(403).json({ msg: "Token inválido" });
  }
}

// --- ROTA DE LOGIN ---
app.post("/login", async (req, res) => {
  const { email, senha } = req.body;

  try {
    // 1. Busca o usuário no banco
    const resultado = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    const usuario = resultado.rows[0];

    if (!usuario) {
      return res.status(400).json({ msg: "Usuário não encontrado" });
    }

    // 2. Compara a senha digitada com o Hash do banco
    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaValida) {
      return res.status(400).json({ msg: "Senha incorreta" });
    }

    // 3. Gera o Token (O Crachá) que vale por 1 hora
    const token = jwt.sign({ id: usuario.id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    // 4. Retorna os dados (menos a senha!)
    res.json({
      msg: "Logado com sucesso!",
      token: token,
      user: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor" });
  }
});

// --- ROTA DE DOCUMENTOS (Protegida) ---
app.get("/meus-documentos", verificarToken, async (req, res) => {
  try {
    // Busca apenas os documentos DO USUÁRIO QUE ESTÁ LOGADO
    const resultado = await db.query(
      "SELECT * FROM documents WHERE user_id = $1 ORDER BY data_upload DESC",
      [req.userId],
    );

    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro ao buscar documentos" });
  }
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SERVIDOR RODANDO NA PORTA ${PORT} 🚀`);
});
