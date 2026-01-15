"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
// Regex de senha forte
const passwordRegex = /^(?=.*\d)(?=.*[\W_]).{6,}$/;
exports.registerSchema = zod_1.z.object({
    body: zod_1.z.object({
        // .min(1, "Mensagem") serve para verificar se não está vazio
        nome: zod_1.z.string().min(1, "Nome é obrigatório").min(3, "Nome deve ter no mínimo 3 letras"),
        email: zod_1.z.string().min(1, "Email é obrigatório").email("Formato de e-mail inválido"),
        senha: zod_1.z
            .string()
            .min(1, "Senha é obrigatória")
            .min(6, "A senha deve ter no mínimo 6 caracteres")
            .regex(passwordRegex, "A senha deve ter pelo menos 1 número e 1 símbolo especial"),
        cpf: zod_1.z.string().min(1, "CPF é obrigatório").length(11, "CPF deve ter exatamente 11 números (apenas números)"),
        // Aqui removemos o 'required_error' que estava dando erro
        telefone: zod_1.z.string().min(1, "Telefone é obrigatório").min(10, "Telefone inválido"),
    }),
});
exports.loginSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().min(1, "E-mail obrigatório").email("E-mail inválido"),
        senha: zod_1.z.string().min(1, "Senha obrigatória"),
    }),
});
exports.forgotPasswordSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().min(1, "E-mail obrigatório").email("E-mail inválido"),
    }),
});
exports.resetPasswordSchema = zod_1.z.object({
    body: zod_1.z.object({
        token: zod_1.z.string().min(1, "Token inválido"),
        newPassword: zod_1.z
            .string()
            .min(1, "Senha é obrigatória")
            .min(6, "A senha deve ter no mínimo 6 caracteres")
            .regex(passwordRegex, "A senha deve ter pelo menos 1 número e 1 símbolo especial"),
    }),
});
