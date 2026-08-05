export const StoryMode = {
  STATIC: "STATIC",
  DYNAMIC: "DYNAMIC",
} as const;

export type StoryMode = (typeof StoryMode)[keyof typeof StoryMode];
