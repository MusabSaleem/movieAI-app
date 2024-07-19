'use server';

import { openai } from '@ai-sdk/openai';
import type { CoreMessage, ToolInvocation } from 'ai';
import { createAI, getMutableAIState, streamUI } from 'ai/rsc';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { z } from 'zod';
import { env } from '../../env';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const content = `\
You are a movie bot and you can help users get information about movies.

Messages inside [] means that it's a UI element or a user event. For example:
- "[Information about Inception]" means that the interface of the movie information about Inception is shown to the user.

If the user wants information about a movie, call \`get_movie_info\` to show the information.
If the user wants the cast of a movie, call \`get_movie_cast\` to show the cast.
If the user wants to search for movies by title, call \`search_movie_title\`.
If the user wants to filter movies by criteria, call \`filter_movies\`.
If the user wants to do anything else, it is an impossible task, so you should respond that you are a demo and cannot do that.

Besides getting information about movies, you can also chat with users.
`;

export async function sendMessage(message: string): Promise<{
  id: number,
  role: 'user' | 'assistant',
  display: ReactNode;
}> {

  const history = getMutableAIState<typeof AI>();

  history.update([
    ...history.get(),
    {
      role: 'user',
      content: message,
    },
  ]);

  const reply = await streamUI({
    model: openai('gpt-3.5-turbo'),
    messages: [
      {
        role: 'system',
        content,
        toolInvocations: []
      },
      ...history.get(),
    ] as CoreMessage[],
    initial: (
      <div className="items-center flex shrink-0 select-none justify-center">
        <Loader2 className="h-5 w-5 animate-spin stroke-zinc-900" />
      </div>
    ),
    text: ({ content, done }) => {
      if (done) history.done([...history.get(), { role: 'assistant', content }]);

      return <div>{content}</div>;
    },
    tools: {
      get_movie_info: {
        description:
          "Get information about a given movie. Use this to show the information to the user.",
        parameters: z.object({
          imdbId: z
            .string()
            .describe("The IMDb ID of the movie. e.g. tt1375666.")
        }),
        generate: async function* ({ imdbId }: { imdbId: string; }) {
          yield (
            <div>Loading movie information...</div>
          );

          const response = await fetch(`https://moviedatabase8.p.rapidapi.com/FindByImbdId/${imdbId}`, {
            headers: {
              'x-rapidapi-host': 'moviedatabase8.p.rapidapi.com',
              'x-rapidapi-key': env.RAPIDAPI_KEY,
            }
          });

          if (!response.ok) {
            return <div>Movie not found!</div>;
          }

          const movie = await response.json();
          console.log(movie)
          await sleep(1000);

          history.done([
            ...history.get(),
            {
              role: 'assistant',
              name: 'get_movie_info',
              content: `[Information about ${movie[0].Title}]`,
            },
          ]);

          return (
            <>
              <h2>{movie[0].title}</h2>
              <p>{movie[0].overview}</p>
              <p>Release Date: {movie[0].release_date}</p>
              <p>Rating: {movie[0].vote_average}</p>
            </>
          );
        },
      },
      get_movie_cast: {
        description:
          "Get the cast of a given movie. Use this to show the cast to the user.",
        parameters: z.object({
          imdbId: z
            .string()
            .describe("The IMDb ID of the movie. e.g. tt1375666.")
        }),
        generate: async function* ({ imdbId }: { imdbId: string; }) {
          yield (
            <div>Loading movie cast...</div>
          );

          const response = await fetch(`https://moviedatabase8.p.rapidapi.com/FindByImbdId/${imdbId}`, {
            headers: {
              'x-rapidapi-host': 'moviedatabase8.p.rapidapi.com',
              'x-rapidapi-key': env.RAPIDAPI_KEY,
            }
          });

          if (!response.ok) {
            return <div>Cast not found!</div>;
          }

          const movie = await response.json();
          const cast = movie[0].Actors.split(', ');

          await sleep(1000);

          history.done([
            ...history.get(),
            {
              role: 'assistant',
              name: 'get_movie_cast',
              content: `[Cast of ${movie[0].Title}]`,
            },
          ]);

          return (
            <div>
              <h2>Cast of {movie[0].Title}</h2>
              <p>{cast.join(', ')}</p>
            </div>
          );
        },
      },
      search_movie_title: {
        description:
          "Search for movies by title. Use this to show a list of matching movies to the user.",
        parameters: z.object({
          title: z
            .string()
            .describe("The title or part of the title of the movie. e.g. Inception.")
        }),
        generate: async function* ({ title }: { title: string; }) {
          yield (
            <div>Searching for movies...</div>
          );

          const response = await fetch(`https://moviedatabase8.p.rapidapi.com/Search/${title}`, {
            headers: {
              'x-rapidapi-host': 'moviedatabase8.p.rapidapi.com',
              'x-rapidapi-key': env.RAPIDAPI_KEY,
            }
          });

          if (!response.ok) {
            return <div>No movies found!</div>;
          }

          const data = await response.json();
          
          const movies = data
          console.log(movies)
          await sleep(1000);

          history.done([
            ...history.get(),
            {
              role: 'assistant',
              name: 'search_movie_title',
              content: `[Movies matching "${title}"]`,
            },
          ]);

          return (
            <div>
              <h2>Movies matching "{title}"</h2>
              <ul>
                {movies?.map((movie: any) => (
                  <li key={movie.id}>{movie.title}</li>
                ))}
              </ul>
            </div>
          );
        },
      },
      filter_movies: {
        description:
          "Filter movies by criteria. Use this to show a list of matching movies to the user.",
        parameters: z.object({
          MinRating: z.number().optional().describe("The minimum rating of the movies."),
          MaxRating: z.number().optional().describe("The maximum rating of the movies."),
          MinYear: z.number().optional().describe("The minimum release year of the movies."),
          MaxYear: z.number().optional().describe("The maximum release year of the movies."),
          MinRevenue: z.number().optional().describe("The minimum revenue of the movies."),
          MaxRevenue: z.number().optional().describe("The maximum revenue of the movies."),
          Genre: z.string().optional().describe("The genre of the movies."),
          MinRuntime: z.number().optional().describe("The minimum runtime of the movies."),
          MaxRuntime: z.number().optional().describe("The maximum runtime of the movies."),
          OriginalLanguage: z.string().optional().describe("The original language of the movies."),
          SpokenLanguage: z.string().optional().describe("The spoken language of the movies."),
          Limit: z.number().optional().describe("The maximum number of results to return."),
        }),
        generate: async function* (params: any) {
          yield (
            <div>Filtering movies...</div>
          );

          const query = new URLSearchParams(params).toString();
          const response = await fetch(`https://moviedatabase8.p.rapidapi.com/Filter?${query}`, {
            headers: {
              'x-rapidapi-host': 'moviedatabase8.p.rapidapi.com',
              'x-rapidapi-key': env.RAPIDAPI_KEY,
            }
          });

          if (!response.ok) {
            return <div>No movies found with the specified criteria!</div>;
          }

          const movies = await response.json();

          await sleep(1000);

          history.done([
            ...history.get(),
            {
              role: 'assistant',
              name: 'filter_movies',
              content: `[Movies matching criteria]`,
            },
          ]);

          return (
            <div>
              <h2>Movies matching criteria</h2>
              <ul>
                {movies.map((movie: any) => (
                  <li key={movie.imdbID}>{movie.Title} ({movie.Year})</li>
                ))}
              </ul>
            </div>
          );
        },
      }
    },
    temperature: 0,
  });

  return {
    id: Date.now(),
    role: 'assistant' as const,
    display: reply.value,
  };
};
// Define the AI state and UI state types
export type AIState = Array<{
  id?: number;
  name?: 'get_movie_info' | 'get_movie_cast' | 'search_movie_title' | 'filter_movies';
  role: 'user' | 'assistant' | 'system';
  content: string;
}>;

export type UIState = Array<{
  id: number;
  role: 'user' | 'assistant';
  display: ReactNode;
  toolInvocations?: ToolInvocation[];
}>;

// Create the AI provider with the initial states and allowed actions
export const AI = createAI({
  initialAIState: [] as AIState,
  initialUIState: [] as UIState,
  actions: {
    sendMessage,
  },
});
