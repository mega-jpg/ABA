export declare function seedBcrTemplates(options?: {
    force?: boolean;
    perType?: number;
}): Promise<{
    created: number;
    skipped: boolean;
}>;
/** Seed chỉ kịch bản Hỏi đáp — không xóa win/draw/lose */
export declare function seedBcrQaTemplates(options?: {
    force?: boolean;
}): Promise<{
    created: number;
    skipped: boolean;
}>;
