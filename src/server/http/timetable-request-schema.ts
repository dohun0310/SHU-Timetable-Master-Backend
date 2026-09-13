import { z } from "zod";

import { weekdaySchema } from "../../domain/schemas/catalog-schema.js";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시각은 HH:MM 형식이어야 합니다.");

// 바구니와 후보 수에 상한을 두어 요청 하나가 탐색을 끝없이 키우지 못하게 한다.
const basketSchema = z.object({
  label: z.string().trim().min(1),
  required: z.boolean().default(true),
  courseIds: z.array(z.string().min(1)).min(1).max(100),
});

export const generateTimetablesSchema = z.object({
  baskets: z.array(basketSchema).min(1).max(20),
  constraints: z
    .object({
      freeDays: z.array(weekdaySchema).optional(),
      avoidBefore: timeSchema.optional(),
      avoidAfter: timeSchema.optional(),
      credits: z
        .object({
          min: z.number().nonnegative().optional(),
          max: z.number().nonnegative().optional(),
        })
        .optional(),
    })
    .optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export type GenerateTimetablesRequest = z.infer<typeof generateTimetablesSchema>;
