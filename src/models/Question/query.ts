import { error } from "console";

import { builder } from "~/builder";

builder.queryField("getAllquestions", (t) =>
  t.prismaField({
    type: ["Question"],
    args: {
      quizId: t.arg({
        type: "String",
        required: true,
      }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      try {
        const questions = await ctx.prisma.question.findMany({
          where: {
            quizId: args.quizId,
          },
        });

        return questions;
      } catch (error) {
        throw new Error("Something went wrong");
      }
    },
  }),
);
