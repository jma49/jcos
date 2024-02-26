const variants = {
  initial: {
    opacity: 0,
    y: 50
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
  transition: { duration: 0.3, ease: 'easeInOut' },
  viewport: { once: true, amount: 0.2 }
};
