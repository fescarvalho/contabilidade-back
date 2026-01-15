"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enviarEmailRecuperacao = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Configuração para usar o Gmail DE VERDADE
const transporter = nodemailer_1.default.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GOOGLE_EMAIL,
        pass: process.env.GOOGLE_API_KEY
    }
});
const enviarEmailRecuperacao = async (destinatario, link) => {
    console.log(`📨 Enviando e-mail para: ${destinatario}`);
    const htmlContent = `
    <div style="font-family: Arial, color: #333;">
      <h2>Leandro Abreu Contabilidade</h2>
      <p>Clique abaixo para redefinir sua senha:</p>
      <a href="${link}" style="background: #C5A059; color: black; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
        Redefinir Senha
      </a>
    </div>
  `;
    try {
        await transporter.sendMail({
            from: '"Leandro Abreu" <leandrocontabil2010@hotmail.com>', // Tem que ser igual ao user acima
            to: destinatario, // AGORA FUNCIONA PARA QUALQUER UM!
            subject: 'Redefinição de Senha',
            html: htmlContent,
        });
        console.log("✅ E-mail enviado com sucesso!");
        return true;
    }
    catch (error) {
        console.error("❌ Erro ao enviar:", error);
        return false;
    }
};
exports.enviarEmailRecuperacao = enviarEmailRecuperacao;
