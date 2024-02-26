import { SyntheticEvent, useRef, useState } from 'react';
import emailjs from '@emailjs/browser';
import { Toaster, toast } from 'sonner';
import Send from '../icons/Send';
import Message from '../icons/Message';
import { motion, AnimatePresence } from 'framer-motion';

function Form() {
  const formRef = useRef<null | HTMLFormElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const sendEmail = (e: SyntheticEvent) => {
    e.preventDefault();
    setIsSending(true);

    emailjs
      .sendForm(
        'service_e9w0kwi',
        'template_yc9r5a7',
        formRef.current as HTMLFormElement,
        'XE6Ik-xKdueAIp44K'
      )
      .then(
        (result) => {
          toast.success('Your message was send');
        },
        (error) => {
          toast.error('Somthing went wrong. Try Again!');
        }
      )
      .finally(() => setIsSending(false));
  };

  return (
    <>
      <Toaster position='top-center' richColors theme='dark' />
      <Message openForm={setIsOpen} />
      <AnimatePresence>
        {isOpen ? (
          <motion.form
            initial={{ bottom: -150 }}
            animate={{ bottom: 10 }}
            ref={formRef}
            exit={{ bottom: -150 }}
            onSubmit={(e) => sendEmail(e)}
            className='fixed z-30 max-md:max-w-xs w-full max-w-md p-6 bg-gradient-to-tr group-hover:opacity-100 from-[#050505] backdrop-blur-md to-gray-900/20  flex flex-col place-content-center h-32  rounded-lg items-center gap-2 mt-10 border border-neutral-300/50'
          >
            <div className='max-w-xs md:max-w-md w-full flex gap-2 relative'>
              <input
                defaultValue=''
                type='text'
                required
                name='message'
                autoComplete='off'
                placeholder="Let's talk!"
                className='outline-none border-b border-neutral-300/50 bg-transparent h-10 w-full px-4 focus:border-neutral-300 transition-colors ease-in-out text-sm font-normal text-inherit placeholder:text-neutral-300/50 peer'
              />
              <button
                type='submit'
                className='rounded-lg h-10 p-1 w-16 flex items-center place-content-center transition-colors ease-in-out group absolute right-0'
              >
                <Send />
              </button>
            </div>
            <span
              onClick={() => setIsOpen(false)}
              className='hover:underline hover:text-red-400 transition-colors ease-in-out p-1 text-neutral-300/50 text-sm cursor-pointer'
            >
              Cancel
            </span>
          </motion.form>
        ) : null}
      </AnimatePresence>
    </>
  );
}
export default Form;
