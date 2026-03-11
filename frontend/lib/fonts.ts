type LocalFontToken = {
    variable: string;
};

// Local fallback tokens: avoid next/font network fetches in restricted builds.
export const dmSans: LocalFontToken = {
    variable: "",
};

export const jetBrainsMono: LocalFontToken = {
    variable: "",
};
