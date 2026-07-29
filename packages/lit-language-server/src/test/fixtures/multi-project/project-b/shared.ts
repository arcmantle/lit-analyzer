// A plain file with no lit templates, listed by both project-a's and
// project-b's tsconfig ("shared" between two projects, in tsconfig terms).
// It must still resolve deterministically to its own nearest tsconfig --
// project-b's, since this file lives inside project-b's own directory --
// regardless of project-a also listing it, and regardless of which project
// happened to boot first.
export const value = 1;
