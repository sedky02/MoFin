import { Redirect } from 'expo-router';

// The Add tab never stays selected (its tab press opens the form), so this only runs for a deep link to /add.
export default function Add() {
  return <Redirect href="/transactions/new" />;
}
