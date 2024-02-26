function ContactForm() {
  return (
    <form className='grid gap-2 mt-10 w-full max-w-md'>
      <div className='grid gap-1'>
        <label className='text-xs text-neutral-200/50'>
          Name<span className='text-red-500'>*</span>
        </label>
        <input
          className='p-1 rounded-lg bg-[#14181d] shadow-inner shadow-black border border-transparent focus:border-red-500 transition-colors duration-300 ease-out focus:outline-none'
          type='text'
        />
      </div>
      <div className='grid gap-1'>
        <label className='text-xs text-neutral-200/50'>
          E-Mail<span className='text-red-500'>*</span>
        </label>
        <input
          className='p-1 rounded-lg bg-[#14181d] shadow-inner shadow-black border border-transparent focus:border-red-500 transition-colors duration-300 ease-out focus:outline-none'
          type='email'
        />
      </div>
      <div className='grid gap-1'>
        <label className='text-xs text-neutral-200/50'>
          Message<span className='text-red-500'>*</span>
        </label>
        <textarea className='p-1 rounded-lg bg-[#14181d] shadow-inner shadow-black border border-transparent focus:border-red-500 transition-colors duration-300 ease-out h-40 focus:outline-none'></textarea>
      </div>
      <button className='p-2 bg-red-500 hover:text-neutral-300 hover:bg-red-600 transition-all duration-300 ease-in-out active:scale-90 text-black rounded-md font-bold font-mono mt-4'>{`onClick={sendMessage(message)}`}</button>
    </form>
  );
}
export default ContactForm;
