import { Request, Response, NextFunction } from "express";
import { ZodError, ZodType } from "zod";

export const validate =
  (schema: ZodType<any>) => (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      next();
    } catch (e) {
      if (e instanceof ZodError) {
        console.log("ERRO DE VALIDAÇÃO ZOD:", JSON.stringify(e, null, 2));
        return res.status(400).json({
          msg: "Dados inválidos",
          errors: e.issues.map((issue) => ({
            campo: issue.path[1],
            mensagem: issue.message,
          })),
        });
      }

      return res.status(400).json({ msg: "Erro inesperado na validação" });
    }
  };
