export declare function seedBcrTemplates(options?: {
    force?: boolean;
    perType?: number;
}): Promise<{
    created: number;
    skipped: boolean;
}>;
export declare function seedBcrQaTemplates(options?: {
    force?: boolean;
}): Promise<{
    created: number;
    skipped: boolean;
}>;
