
'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function AddRecipePage() {
  const [title, setTitle] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [ingredients, setIngredients] = useState<string[]>(['']);

  async function submit() {
    const steps = instructions
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .map((body, i) => ({ step_number: i + 1, body }));

    const { data, error } = await supabase.rpc('add_full_recipe', {
      p_title: title,
      p_cuisine: cuisine || null,
      p_photo_url: null,
      p_source_url: sourceUrl || null,
      p_instructions: instructions,
      p_ingredients: ingredients
        .map(i => i.trim())
        .filter(Boolean)
        .map(i => ({ item_name: i })),
      p_steps: steps
    });

    if (error) {
      alert(`Error: ${error.message}`);
      return;
    }
    alert('Recipe saved!');
    setTitle(''); setCuisine(''); setSourceUrl(''); setInstructions(''); setIngredients(['']);
  }

  return (
    <div style={{maxWidth: 720, margin: '40px auto', padding: 16}}>
      <h1>Add a Recipe</h1>

      <label>Title</label>
      <input value={title} onChange={(e)=>setTitle(e.target.value)} style={{width:'100%', padding:8, marginBottom:10}} />

      <label>Cuisine</label>
      <input value={cuisine} onChange={(e)=>setCuisine(e.target.value)} style={{width:'100%', padding:8, marginBottom:10}} />

      <label>Source URL (optional)</label>
      <input value={sourceUrl} onChange={(e)=>setSourceUrl(e.target.value)} style={{width:'100%', padding:8, marginBottom:10}} />

      <label>Ingredients (one per line or add more boxes)</label>
      {ingredients.map((val, idx)=>(
        <input key={idx} value={val}
          onChange={(e)=>{ const copy=[...ingredients]; copy[idx]=e.target.value; setIngredients(copy); }}
          style={{width:'100%', padding:8, marginBottom:8}}
          placeholder={`Ingredient ${idx+1}`} />
      ))}
      <button type="button" onClick={()=>setIngredients([...ingredients, ''])}>+ Add ingredient</button>

      <label style={{display:'block', marginTop:16}}>Instructions (one step per line)</label>
      <textarea value={instructions} onChange={(e)=>setInstructions(e.target.value)}
        rows={8} style={{width:'100%', padding:8}} />

      <div style={{marginTop:16, display:'flex', gap:8}}>
        <button type="button" onClick={submit}>Save</button>
      </div>
    </div>
  );
}
