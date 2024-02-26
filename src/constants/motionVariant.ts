const variants = {
  initial: {
    opacity: 0,
    y: 10
  },

  animate: {
    opacity: 1,
    y: 0
  }
};
export const config = {
  variants: variants,
  initial: 'initial',
  whileInView: 'animate',
  transition: { duration: 0.3, ease: 'easeIn' },
  viewport: { once: true }
};
