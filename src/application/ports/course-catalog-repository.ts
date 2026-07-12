import type { CourseCatalog } from "../../domain/schemas/catalog-schema.js";

export interface CourseCatalogRepository {
  save(catalog: CourseCatalog): Promise<void>;
}
