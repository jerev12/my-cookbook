async function submit() {
  if (!title.trim()) {
    alert('Please add a title');
    return;
  }
  if (!instructions.trim()) {
    alert('Please add instructions (one step per line)');
    return;
  }

  // Check client-side auth (you already saw this was OK)
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user) {
    alert('No signed-in user — please log in again.');
    return;
  }

  // 🔎 NEW: Ask the DATABASE who it thinks you are
  const { data: who, error: whoErr } = await supabase.rpc('who_am_i');
  alert('Server sees user id: ' + JSON.stringify(who) + '\nError: ' + JSON.stringify(whoErr));
  // If this alert shows `null`, the token isn’t reaching Postgres (we’ll fix config).
  if (!who) {
    alert('The server did not receive your auth token. See notes below to fix.');
    return;
  }

  setBusy(true);

  const steps = instructions
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .map((body, i) => ({ step_number: i + 1, body }));

  const { error } = await supabase.rpc('add_full_recipe', {
    p_title: title,
    p_cuisine: cuisine || null,
    p_photo_url: null,
    p_source_url: sourceUrl || null,
    p_instructions: instructions,
    p_ingredients: ingredients
      .map(i => i.trim())
      .filter(Boolean)
      .map(i => ({ item_name: i })),
    p_steps: steps,
    p_visibility: visibility,
  });

  setBusy(false);

  if (error) {
    alert(`Error: ${error.message}`);
    return;
  }
  alert('Recipe saved!');
  setTitle('');
  setCuisine('');
  setSourceUrl('');
  setInstructions('');
  setIngredients(['']);
  setVisibility('private');
}
