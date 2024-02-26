const variants = {
  initial: {
    opacity: 0,
    scale: 0
  },

  animate: {
    opacity: 1,
    scale: 1
  }
};
export const config = {
  variants: variants,
  initial: 'initial',
  whileInView: 'animate',
  transition: { duration: 0.5, ease: 'backIn' },
  viewport: { once: true }
};
