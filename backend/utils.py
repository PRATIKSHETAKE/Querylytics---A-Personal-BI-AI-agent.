import pandas as pd
import io

def get_dataframe_schema(df: pd.DataFrame, filename: str) -> str:
    """
    Generates a text-based summary of the dataframe for the VectorDB.
    """
    buffer = io.StringIO()
    df.info(buf=buffer)
    info_str = buffer.getvalue()
    
    # Statistical summary (top 10 columns for token efficiency)
    summary = df.describe(include='all').iloc[:, :10].to_string() 
    
    schema_context = f"""
    Dataset Name: {filename}
    
    Column Information:
    {info_str}
    
    Statistical Summary:
    {summary}
    
    Sample Data (First 3 rows):
    {df.head(3).to_csv(index=False)}
    """
    return schema_context