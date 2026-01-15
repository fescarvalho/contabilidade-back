import { z } from "zod";

// Regex de senha forte
const passwordRegex = /^(?=.*\d)(?=.*[\W_]).{6,}$/;

export const registerSchema = z.object({
  body: z.object({
    // .min(1, "Mensagem") serve para verificar se não está vazio
    nome: z.string().min(1, "Nome é obrigatório").min(3, "Nome deve ter no mínimo 3 letras"),
    
    email: z.string().min(1, "Email é obrigatório").email("Formato de e-mail inválido"),
    
    senha: z
      .string()
      .min(1, "Senha é obrigatória")
      .min(6, "A senha deve ter no mínimo 6 caracteres")
      .regex(passwordRegex, "A senha deve ter pelo menos 1 número e 1 símbolo especial"),
      
    cpf: z.string().min(1, "CPF é obrigatório").length(11, "CPF deve ter exatamente 11 números (apenas números)"),
    
    // Aqui removemos o 'required_error' que estava dando erro
    telefone: z.string().min(1, "Telefone é obrigatório").min(10, "Telefone inválido"),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().min(1, "E-mail obrigatório").email("E-mail inválido"),
    senha: z.string().min(1, "Senha obrigatória"),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().min(1, "E-mail obrigatório").email("E-mail inválido"),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Token inválido"),
    newPassword: z
      .string()
      .min(1, "Senha é obrigatória")
      .min(6, "A senha deve ter no mínimo 6 caracteres")
      .regex(passwordRegex, "A senha deve ter pelo menos 1 número e 1 símbolo especial"),
  }),
});