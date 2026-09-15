# TODO after current session

# Workouts 
Workout landing page feeils weird

## The deletion mechanism needs to be moved to the workouts aswell. 

Check if we can adapt the swipe mechanism to the whole exercise / set div to make deletion easier. 

## The deletion mechanism for exercises 

the deletion for exercises with sets looks weird.
Btw. what happens to those deleted sets/exercises ????
They should not add to the calculation? 
Add soft_deleted hard_deleted tag / deleted_at timestamp on each entity? 


## Analyze workouts
Whats the best way to calculate the amount of weight moved after one set/exercise/workout ? 
    Lambda server functions? 
    Is that client sided a good idea, or should a server somewhere handle that? 
    Save that on the workout_exercise table?
    maybe use the attributes json to save that data? 
    Does another table make sense?

### Data to save and analyze
Weight per set
Weight per exercise 
history and comparison filtered down to: 
- exercise over time
- compare this week / last week directly 
- compare the last couple of weeks


## General questions 
What the fuck is a superset_group

