import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, Grid, Container } from "../components/Layout";

const Box = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: "var(--color-primary-subtle)", border: "1px solid var(--color-primary)", borderRadius: "var(--radius)", padding: "var(--sp-3)", color: "var(--color-primary)", fontSize: "var(--text-sm)", textAlign: "center" }}>
    {children}
  </div>
);

/* ── Stack ────────────────────────────────────────────────────── */
/**
 * `Stack` is a one-dimensional flex layout primitive.
 */
const stackMeta = {
  title: "Layout/Stack",
  component: Stack,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof Stack>;
export default stackMeta;
type StackStory = StoryObj<typeof stackMeta>;

export const Vertical: StackStory = {
  render: () => (
    <Stack direction="column" gap={4}>
      <Box>Item 1</Box><Box>Item 2</Box><Box>Item 3</Box>
    </Stack>
  ),
};
export const Horizontal: StackStory = {
  render: () => (
    <Stack direction="row" gap={4} align="center">
      <Box>Item A</Box><Box>Item B</Box><Box>Item C</Box>
    </Stack>
  ),
};
